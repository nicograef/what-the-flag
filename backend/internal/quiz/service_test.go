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

// as returns a PlayerFunc that always returns p.
func as(p PlayerID) PlayerFunc {
	return func(context.Context) (PlayerID, error) { return p, nil }
}

// noPlayer is a PlayerFunc for a start that must fail before it asks for a player.
func noPlayer(t *testing.T) PlayerFunc {
	return func(context.Context) (PlayerID, error) {
		t.Error("a rejected start asked for a player")
		return PlayerID{}, nil
	}
}

func TestService(t *testing.T) {
	cat, err := country.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	ctx := context.Background()
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	nicoID := PlayerID(uuid.New())
	nico, ana := as(nicoID), as(PlayerID(uuid.New()))
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
	// endRun serves the run's next question and answers it wrong.
	endRun := func(t *testing.T, s *Service, mem *memory, id RunID) {
		t.Helper()
		st := state(t, s, id)
		wrong := (mem.questions[st.QuizID][st.Question.Position].Correct + 1) % 4
		if _, err := s.Answer(ctx, id, st.Question.Position, &wrong); err != nil {
			t.Fatalf("Answer: %v", err)
		}
	}

	t.Run("Start without a quiz creates one with a creator run", func(t *testing.T) {
		s, mem, _ := setup()
		runID, quizID, err := s.Start(ctx, nico, "  Nico  ", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		want := Run{ID: runID, QuizID: quizID, Player: nicoID, Name: "Nico", Creator: true, StartedAt: t0}
		if _, ok := mem.quizzes[quizID]; !ok || !reflect.DeepEqual(*mem.runs[runID], want) {
			t.Errorf("quiz stored %t, run %+v; want %+v", ok, mem.runs[runID], want)
		}
	})

	t.Run("Start on a quiz creates a non-creator run", func(t *testing.T) {
		s, mem, _ := setup()
		creator, quizID, err := s.Start(ctx, nico, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		endRun(t, s, mem, creator)
		runID, got, err := s.Start(ctx, ana, "Ana", &quizID)
		if err != nil || got != quizID || mem.runs[runID].Creator || len(mem.quizzes) != 1 {
			t.Errorf("Start = %v, %v; creator %t, %d quizzes", got, err, mem.runs[runID].Creator, len(mem.quizzes))
		}
	})

	t.Run("Start on a quiz waits for the creator run to end", func(t *testing.T) {
		s, mem, clock := setup()
		creator, quizID, err := s.Start(ctx, nico, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		state(t, s, creator)
		for _, at := range []time.Duration{0, Limit + Grace} {
			clock.now = t0.Add(at)
			if _, _, err := s.Start(ctx, noPlayer(t), "Ana", &quizID); !errors.Is(err, ErrQuizInProgress) || len(mem.runs) != 1 {
				t.Fatalf("Start at +%v = %v with %d runs, want ErrQuizInProgress and only the creator", at, err, len(mem.runs))
			}
		}
		// Past Limit plus Grace the open answer is late, so the creator run has ended.
		clock.now = t0.Add(Limit + Grace + time.Microsecond)
		if _, _, err := s.Start(ctx, ana, "Ana", &quizID); err != nil {
			t.Errorf("Start after the creator's deadline = %v, want a run", err)
		}
	})

	t.Run("Start on an unknown quiz", func(t *testing.T) {
		s, mem, _ := setup()
		unknown := QuizID(uuid.New())
		if _, _, err := s.Start(ctx, noPlayer(t), "Nico", &unknown); !errors.Is(err, ErrQuizNotFound) || len(mem.runs) != 0 {
			t.Errorf("Start = %v with %d runs, want ErrQuizNotFound and none", err, len(mem.runs))
		}
	})

	t.Run("State serves, keeps and advances the question", func(t *testing.T) {
		s, mem, clock := setup()
		runID, quizID, err := s.Start(ctx, nico, "Nico", nil)
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
		first, quizID, err := s.Start(ctx, nico, "Nico", nil)
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
		endRun(t, s, mem, first)
		second, _, err := s.Start(ctx, ana, "Ana", &quizID)
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
		if len(mem.questions[quizID]) != 3 {
			t.Errorf("quiz holds %d questions, want the creator's 3", len(mem.questions[quizID]))
		}
	})

	t.Run("a run that used every country completes", func(t *testing.T) {
		mem, clock := newMemory(), &fixedClock{now: t0}
		s := NewService(mem, mem, fivePool("R1", "R2", "R3", "R4", "R5"), clock, newRand(1))
		runID, _, err := s.Start(ctx, nico, "Nico", nil)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		for position := range 5 {
			st := state(t, s, runID)
			clock.now = clock.now.Add(time.Second)
			if _, err := s.Answer(ctx, runID, position, new(st.Question.Question.Correct)); err != nil {
				t.Fatalf("Answer %d: %v", position, err)
			}
		}
		st := state(t, s, runID)
		want := &Result{Score: 5, EndReason: EndCompleted}
		if st.Question != nil || !reflect.DeepEqual(st.Result, want) {
			t.Errorf("State = question %+v, result %+v; want no question and %+v", st.Question, st.Result, want)
		}
	})
}
