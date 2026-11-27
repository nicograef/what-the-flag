package quiz

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nicograef/what-the-flag/internal/country"
)

type fixedClock struct{ now time.Time }

func (c *fixedClock) Now() time.Time { return c.now }

func TestService(t *testing.T) {
	cat, err := country.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	ctx := context.Background()
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	setup := func() (*Service, *memory, *fixedClock) {
		mem, clock := newMemory(), &fixedClock{now: t0}
		return NewService(mem, mem, cat, clock, newRand(1)), mem, clock
	}
	state := func(t *testing.T, s *Service, id RunID) RunState {
		t.Helper()
		st, err := s.State(ctx, id)
		if err != nil {
			t.Fatalf("State: %v", err)
		}
		return st
	}

	t.Run("Start without a quiz creates one with a creator run", func(t *testing.T) {
		s, mem, _ := setup()
		runID, quizID, err := s.Start(ctx, "  Nico  ", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		want := Run{ID: runID, QuizID: quizID, Name: "Nico", Creator: true, StartedAt: t0}
		if _, ok := mem.quizzes[quizID]; !ok || !reflect.DeepEqual(*mem.runs[runID], want) {
			t.Errorf("quiz stored %t, run %+v; want %+v", ok, mem.runs[runID], want)
		}
	})

	t.Run("Start on a quiz creates a non-creator run", func(t *testing.T) {
		s, mem, _ := setup()
		_, quizID, err := s.Start(ctx, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		runID, got, err := s.Start(ctx, "Ana", &quizID)
		if err != nil || got != quizID || mem.runs[runID].Creator || len(mem.quizzes) != 1 {
			t.Errorf("Start = %v, %v; creator %t, %d quizzes", got, err, mem.runs[runID].Creator, len(mem.quizzes))
		}
	})

	t.Run("Start on an unknown quiz", func(t *testing.T) {
		s, mem, _ := setup()
		unknown := QuizID(uuid.New())
		if _, _, err := s.Start(ctx, "Nico", &unknown); !errors.Is(err, ErrQuizNotFound) || len(mem.runs) != 0 {
			t.Errorf("Start = %v with %d runs, want ErrQuizNotFound and none", err, len(mem.runs))
		}
	})

	t.Run("State serves, keeps and advances the question", func(t *testing.T) {
		s, mem, clock := setup()
		runID, quizID, err := s.Start(ctx, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		first := state(t, s, runID)
		stored := mem.questions[quizID][0]
		want := &Served{Position: 0, Question: stored, Deadline: t0.Add(Limit)}
		if !reflect.DeepEqual(first.Question, want) || first.Result != nil {
			t.Fatalf("first read = %+v, want question %+v", first, want)
		}
		clock.now = t0.Add(time.Second)
		if again := state(t, s, runID); !reflect.DeepEqual(again.Question, want) {
			t.Fatalf("second read question = %+v, want %+v", again.Question, want)
		}
		if _, err := s.Answer(ctx, runID, 0, new(stored.Correct)); err != nil {
			t.Fatalf("Answer: %v", err)
		}
		next := state(t, s, runID)
		if next.Score != 1 || next.Question == nil || next.Question.Position != 1 ||
			next.Question.Question != mem.questions[quizID][1] || !next.Question.Deadline.Equal(clock.now.Add(Limit)) {
			t.Errorf("after a correct answer = %+v, want score 1 and stored position 1", next)
		}
	})

	t.Run("a second run on the quiz gets the stored questions", func(t *testing.T) {
		s, mem, clock := setup()
		first, quizID, err := s.Start(ctx, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		for position := range 2 {
			state(t, s, first)
			clock.now = clock.now.Add(time.Second)
			if _, err := s.Answer(ctx, first, position, new(mem.questions[quizID][position].Correct)); err != nil {
				t.Fatalf("Answer %d: %v", position, err)
			}
		}
		second, _, err := s.Start(ctx, "Ana", &quizID)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		for position := range 2 {
			st := state(t, s, second)
			if st.Question == nil || st.Question.Question != mem.questions[quizID][position] {
				t.Fatalf("position %d = %+v, want %+v", position, st.Question, mem.questions[quizID][position])
			}
			clock.now = clock.now.Add(time.Second)
			if _, err := s.Answer(ctx, second, position, new(st.Question.Question.Correct)); err != nil {
				t.Fatalf("Answer %d: %v", position, err)
			}
		}
		if len(mem.questions[quizID]) != 2 {
			t.Errorf("quiz holds %d questions, want 2", len(mem.questions[quizID]))
		}
	})
}
