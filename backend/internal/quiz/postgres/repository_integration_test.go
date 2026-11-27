//go:build integration

package postgres

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/postgres"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// newRun stores a run on quiz, or on a fresh quiz when quiz is nil.
func newRun(t *testing.T, repo *Repository, q *quiz.QuizID) quiz.Run {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Truncate(time.Microsecond)
	r := quiz.Run{ID: quiz.RunID(uuid.New()), Name: "repo test", StartedAt: now}
	if q == nil {
		r.Creator = true
		id, err := repo.CreateQuizWithRun(ctx, r)
		if err != nil {
			t.Fatalf("create quiz: %v", err)
		}
		r.QuizID = id
		return r
	}
	r.QuizID = *q
	if err := repo.CreateRun(ctx, r); err != nil {
		t.Fatalf("create run: %v", err)
	}
	return r
}

func TestCreateQuizWithRunIsAtomic(t *testing.T) {
	ctx := context.Background()
	tx := postgres.TestTx(t)
	now := time.Now().Truncate(time.Microsecond)
	// An empty name breaks the runs CHECK, so the run insert fails after the quiz insert.
	run := quiz.Run{ID: quiz.RunID(uuid.New()), Creator: true, StartedAt: now}
	if _, err := NewRepository(tx).CreateQuizWithRun(ctx, run); err == nil {
		t.Fatal("CreateQuizWithRun with an empty name succeeded")
	}
	var quizzes int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM quizzes WHERE created_at = $1", now).Scan(&quizzes); err != nil {
		t.Fatalf("count quizzes: %v", err)
	}
	if quizzes != 0 {
		t.Fatalf("%d quizzes left behind, want 0", quizzes)
	}
}

func TestAddQuestionRace(t *testing.T) {
	ctx := context.Background()
	repo := NewRepository(postgres.TestPool(t))
	first := newRun(t, repo, nil)
	second := newRun(t, repo, &first.QuizID)
	q1 := quiz.Question{Type: quiz.Types[0], Target: "DE", Options: [4]string{"DE", "FR", "IT", "ES"}, Correct: 0}
	q2 := quiz.Question{Type: quiz.Types[1], Target: "JP", Options: [4]string{"CN", "JP", "KR", "VN"}, Correct: 1}

	added := make(chan struct{})
	var got [2]quiz.Question
	var errs [2]error
	var wg sync.WaitGroup
	wg.Go(func() {
		errs[0] = repo.InRun(ctx, first.ID, func(u quiz.UnitOfWork) error {
			var err error
			got[0], err = u.AddQuestion(0, q1)
			close(added)
			// Hold the uncommitted insert so the second transaction's insert has to wait for it.
			time.Sleep(200 * time.Millisecond)
			return err
		})
	})
	wg.Go(func() {
		<-added
		errs[1] = repo.InRun(ctx, second.ID, func(u quiz.UnitOfWork) error {
			var err error
			got[1], err = u.AddQuestion(0, q2)
			return err
		})
	})
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("transaction %d: %v", i, err)
		}
		if got[i] != q1 {
			t.Fatalf("transaction %d got %+v, want the first stored %+v", i, got[i], q1)
		}
	}
}

func TestInRunConcurrent(t *testing.T) {
	ctx := context.Background()
	pool := postgres.TestPool(t)
	repo := NewRepository(pool)
	cat, err := country.Load()
	if err != nil {
		t.Fatalf("load catalogue: %v", err)
	}
	svc := quiz.NewService(repo, nil, cat, clock{}, NewRand())
	run, _, err := svc.Start(ctx, "concurrent", nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	var states [10]quiz.RunState
	var errs [10]error
	var wg sync.WaitGroup
	for i := range states {
		wg.Go(func() { states[i], errs[i] = svc.State(ctx, run) })
	}
	wg.Wait()
	for i, st := range states {
		if errs[i] != nil {
			t.Fatalf("read %d: %v", i, errs[i])
		}
		if st.Question == nil || st.Question.Position != 0 || *st.Question != *states[0].Question {
			t.Fatalf("read %d served %+v, want position 0 as read 0 served %+v", i, st.Question, states[0].Question)
		}
	}
	var served int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM run_answers WHERE run_id = $1", uuid.UUID(run)).Scan(&served); err != nil {
		t.Fatalf("count answers: %v", err)
	}
	if served != 1 {
		t.Fatalf("served %d answers, want 1", served)
	}
}

type clock struct{}

func (clock) Now() time.Time { return time.Now() }
