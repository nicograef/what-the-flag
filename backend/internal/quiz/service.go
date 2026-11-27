package quiz

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Service runs the quiz use cases over the ports.
type Service struct {
	repo   Repository
	boards Leaderboards
	cat    Catalogue
	clock  Clock
	rnd    Rand
}

// NewService returns a Service over the given ports.
func NewService(repo Repository, boards Leaderboards, cat Catalogue, clock Clock, rnd Rand) *Service {
	return &Service{repo: repo, boards: boards, cat: cat, clock: clock, rnd: rnd}
}

// RunState is a run as its player sees it: the open question while it plays, the result once it ended.
type RunState struct {
	ID       RunID
	QuizID   QuizID
	Name     string
	Score    int
	Now      time.Time
	Question *Served
	Result   *Result
}

// Served is the open question of a run; Deadline is its serving time plus Limit.
type Served struct {
	Position int
	Question Question
	Deadline time.Time
}

// Result is how a run ended; Last is the missed question, nil for a completed run.
type Result struct {
	Score     int
	EndReason EndReason
	Last      *Missed
}

// Missed is the question that ended a run; Chosen is nil for a timeout.
type Missed struct {
	Position int
	Question Question
	Chosen   *int
}

// now reads the clock at the µs precision the database stores.
func (s *Service) now() time.Time {
	return s.clock.Now().Truncate(time.Microsecond)
}

// Start creates a run named name. Without a quiz it creates a fresh quiz with this run as its creator.
func (s *Service) Start(ctx context.Context, name string, quiz *QuizID) (RunID, QuizID, error) {
	name, err := NormalizeName(name)
	if err != nil {
		return RunID{}, QuizID{}, err
	}
	now := s.now()
	r := Run{Name: name, StartedAt: now}
	if quiz == nil {
		if r.QuizID, err = s.repo.CreateQuiz(ctx, now); err != nil {
			return RunID{}, QuizID{}, fmt.Errorf("create quiz: %w", err)
		}
		r.Creator = true
	} else {
		ok, err := s.repo.QuizExists(ctx, *quiz)
		if err != nil {
			return RunID{}, QuizID{}, fmt.Errorf("find quiz: %w", err)
		}
		if !ok {
			return RunID{}, QuizID{}, ErrQuizNotFound
		}
		r.QuizID = *quiz
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return RunID{}, QuizID{}, fmt.Errorf("run id: %w", err)
	}
	r.ID = RunID(id)
	if err := s.repo.CreateRun(ctx, r); err != nil {
		return RunID{}, QuizID{}, fmt.Errorf("create run: %w", err)
	}
	return r.ID, r.QuizID, nil
}

// State expires a late answer, serves the next question of a playing run without an open one, and returns the run.
func (s *Service) State(ctx context.Context, id RunID) (RunState, error) {
	var st RunState
	err := s.repo.InRun(ctx, id, func(uow UnitOfWork) error {
		now := s.now()
		r := uow.Run()
		r.Expire(now)
		if !r.Finished() && r.open() == nil {
			if err := s.serveNext(uow, r, now); err != nil {
				return err
			}
		}
		if err := uow.SaveRun(r); err != nil {
			return fmt.Errorf("save run: %w", err)
		}
		var err error
		st, err = s.state(uow, r, now)
		return err
	})
	return st, err
}

// serveNext serves the stored question at the run's next position, generating and storing it first if needed.
// A quiz without an unused country completes the run.
func (s *Service) serveNext(uow UnitOfWork, r *Run, now time.Time) error {
	position := r.Score
	_, ok, err := uow.Question(position)
	if err != nil {
		return fmt.Errorf("read question: %w", err)
	}
	if !ok {
		used, err := uow.Targets()
		if err != nil {
			return fmt.Errorf("read targets: %w", err)
		}
		q, err := Generate(s.cat, position, used, s.rnd)
		if errors.Is(err, ErrQuizExhausted) {
			r.Complete(now)
			return nil
		}
		if err != nil {
			return err
		}
		if _, err := uow.AddQuestion(position, q); err != nil {
			return fmt.Errorf("add question: %w", err)
		}
	}
	return r.Serve(position, now)
}

func (s *Service) state(uow UnitOfWork, r *Run, now time.Time) (RunState, error) {
	st := RunState{ID: r.ID, QuizID: r.QuizID, Name: r.Name, Score: r.Score, Now: now}
	if a := r.open(); a != nil {
		q, err := storedQuestion(uow, a.Position)
		if err != nil {
			return RunState{}, err
		}
		st.Question = &Served{Position: a.Position, Question: q, Deadline: a.ServedAt.Add(Limit)}
		return st, nil
	}
	if !r.Finished() {
		return st, nil
	}
	st.Result = &Result{Score: r.Score, EndReason: r.EndReason}
	if a := r.answer(r.Score); a != nil && r.EndReason != EndCompleted {
		q, err := storedQuestion(uow, a.Position)
		if err != nil {
			return RunState{}, err
		}
		st.Result.Last = &Missed{Position: a.Position, Question: q, Chosen: a.Option}
	}
	return st, nil
}

// Answer answers the question at position with option, nil for no answer.
func (s *Service) Answer(ctx context.Context, id RunID, position int, option *int) (Outcome, error) {
	if err := checkOption(option); err != nil {
		return Outcome{}, err
	}
	var out Outcome
	err := s.repo.InRun(ctx, id, func(uow UnitOfWork) error {
		r := uow.Run()
		if r.answer(position) == nil {
			return ErrNotCurrentQuestion
		}
		q, err := storedQuestion(uow, position)
		if err != nil {
			return err
		}
		if out, err = r.Answer(position, option, q.Correct, s.now()); err != nil {
			return err
		}
		if err := uow.SaveRun(r); err != nil {
			return fmt.Errorf("save run: %w", err)
		}
		return nil
	})
	return out, err
}

// storedQuestion reads the question of a served position, which a served position always has.
func storedQuestion(uow UnitOfWork, position int) (Question, error) {
	q, ok, err := uow.Question(position)
	if err != nil {
		return Question{}, fmt.Errorf("read question: %w", err)
	}
	if !ok {
		return Question{}, fmt.Errorf("served position %d has no stored question", position)
	}
	return q, nil
}
