//go:build integration

package postgres

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/postgres"
	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/quiz/postgres/internal/db"
)

// newPlayer stores a player under a random key hash.
func newPlayer(t *testing.T, d db.DBTX) quiz.PlayerID {
	t.Helper()
	hash := sha256.Sum256([]byte(uuid.NewString()))
	id, err := NewPlayers(d).Create(context.Background(), hash[:])
	if err != nil {
		t.Fatalf("create player: %v", err)
	}
	return id
}

// newRun stores a run of a fresh player on quiz, or on a fresh quiz when quiz is nil.
func newRun(t *testing.T, repo *Repository, q *quiz.QuizID) quiz.Run {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Truncate(time.Microsecond)
	r := quiz.Run{ID: quiz.RunID(uuid.New()), Player: newPlayer(t, repo.db), Name: "repo test", StartedAt: now}
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
	run := quiz.Run{ID: quiz.RunID(uuid.New()), Player: newPlayer(t, tx), Creator: true, StartedAt: now}
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
			err := u.AddQuestion(0, q1)
			close(added)
			if err != nil {
				return err
			}
			// Hold the uncommitted insert so the second transaction's insert has to wait for it.
			time.Sleep(200 * time.Millisecond)
			got[0], _, err = u.Question(0)
			return err
		})
	})
	wg.Go(func() {
		<-added
		errs[1] = repo.InRun(ctx, second.ID, func(u quiz.UnitOfWork) error {
			if err := u.AddQuestion(0, q2); err != nil {
				return err
			}
			var err error
			got[1], _, err = u.Question(0)
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

// TestEveryTypeFitsTheSchema pins quiz.Types against the quiz_questions type and prompt CHECKs.
func TestEveryTypeFitsTheSchema(t *testing.T) {
	ctx := context.Background()
	repo := NewRepository(postgres.TestTx(t))
	run := newRun(t, repo, nil)
	err := repo.InRun(ctx, run.ID, func(u quiz.UnitOfWork) error {
		for position, ty := range quiz.Types {
			q := quiz.Question{Type: ty, Target: "DE", Options: [4]string{"DE", "FR", "IT", "ES"}}
			if ty.Prompt == quiz.AttrRegionalLanguage {
				q.Prompt = "hsb"
			}
			if err := u.AddQuestion(position, q); err != nil {
				return fmt.Errorf("type %s: %w", ty.ID(), err)
			}
			stored, ok, err := u.Question(position)
			if err != nil {
				return fmt.Errorf("type %s: %w", ty.ID(), err)
			}
			if !ok || stored != q {
				return fmt.Errorf("type %s stored as %+v, %t", ty.ID(), stored, ok)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
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
	// A *rand.Rand is not safe for concurrent use; the run's row lock serializes every draw.
	svc := quiz.NewService(repo, nil, cat, clock{}, rand.New(rand.NewPCG(1, 1))) //nolint:gosec // G404: a seeded test source.
	player := newPlayer(t, pool)
	run, _, err := svc.Start(ctx, func(context.Context) (quiz.PlayerID, error) { return player, nil }, "concurrent", nil)
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
