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
// GlobalRank is nil for a run from a challenge link.
type Result struct {
	Score      int
	EndReason  EndReason
	Last       *Missed
	QuizRank   int
	GlobalRank *int
	Best       Best
}

// Me is what the server knows of a player: the latest run's name and quiz, the best score of an ended run,
// and the rank and score of their best run on the global list. Each is nil without a player or such a run.
type Me struct {
	LastName  *string
	Best      *int
	WorldRank *int
	WorldBest *int
	LastQuiz  *QuizID
}

// Challenge is a quiz as its challenge page shows it: the creator's run and the quiz's list.
// Creator is nil when the owner hid the creator's run, so its name is never served.
type Challenge struct {
	Creator *CreatorView
	Top     []Entry
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

// PlayerFunc returns the player a new run belongs to.
type PlayerFunc func(context.Context) (PlayerID, error)

// Start creates a run named name for the player that player returns, which Start calls only once the request
// is valid. Without a quiz it creates a fresh quiz with this run as its creator; on a quiz it waits for the
// creator run to end.
func (s *Service) Start(ctx context.Context, player PlayerFunc, name string, quiz *QuizID) (RunID, QuizID, error) {
	name, err := NormalizeName(name)
	if err != nil {
		return RunID{}, QuizID{}, err
	}
	now := s.now()
	if quiz != nil {
		// A challenge run would generate and reveal positions the creator has not reached yet.
		// A hidden creator run ranks nowhere, so its quiz stays playable.
		creator, err := s.boards.Creator(ctx, *quiz, now, nil)
		if errors.Is(err, ErrQuizNotFound) {
			return RunID{}, QuizID{}, err
		}
		if err != nil {
			return RunID{}, QuizID{}, fmt.Errorf("find creator run: %w", err)
		}
		if creator != nil && !creator.Ended {
			return RunID{}, QuizID{}, ErrQuizInProgress
		}
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return RunID{}, QuizID{}, fmt.Errorf("run id: %w", err)
	}
	r := Run{ID: RunID(id), Name: name, StartedAt: now}
	if r.Player, err = player(ctx); err != nil {
		return RunID{}, QuizID{}, fmt.Errorf("player: %w", err)
	}
	if quiz == nil {
		r.Creator = true
		if r.QuizID, err = s.repo.CreateQuizWithRun(ctx, r); err != nil {
			return RunID{}, QuizID{}, fmt.Errorf("create quiz: %w", err)
		}
		return r.ID, r.QuizID, nil
	}
	r.QuizID = *quiz
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
	if err != nil || st.Result == nil {
		return st, err
	}
	// Ranks read after the commit, so they see the run's final score.
	ranks, err := s.boards.Ranks(ctx, id, st.Now)
	if err != nil {
		return RunState{}, fmt.Errorf("ranks: %w", err)
	}
	st.Result.QuizRank, st.Result.GlobalRank = ranks.Quiz, ranks.Global
	if st.Result.Best, err = s.boards.Best(ctx, id, st.Now); err != nil {
		return RunState{}, fmt.Errorf("best: %w", err)
	}
	return st, nil
}

// Me returns what the server knows of player, nil for none.
func (s *Service) Me(ctx context.Context, player *PlayerID) (Me, error) {
	if player == nil {
		return Me{}, nil
	}
	now := s.now()
	sum, err := s.boards.Player(ctx, *player, now)
	if err != nil {
		return Me{}, fmt.Errorf("player summary: %w", err)
	}
	me := Me{LastName: sum.LastName, Best: sum.Best, LastQuiz: sum.LastQuiz}
	if sum.WorldRun == nil {
		return me, nil
	}
	ranks, err := s.boards.Ranks(ctx, *sum.WorldRun, now)
	if err != nil {
		return Me{}, fmt.Errorf("world rank: %w", err)
	}
	if ranks.Global != nil {
		me.WorldRank, me.WorldBest = ranks.Global, sum.WorldBest
	}
	return me, nil
}

// Challenge returns a quiz's creator run and its list; own is the requester's player, nil for none.
func (s *Service) Challenge(ctx context.Context, id QuizID, own *PlayerID) (Challenge, error) {
	now := s.now()
	creator, err := s.boards.Creator(ctx, id, now, own)
	if errors.Is(err, ErrQuizNotFound) {
		return Challenge{}, err
	}
	if err != nil {
		return Challenge{}, fmt.Errorf("find creator run: %w", err)
	}
	top, err := s.boards.Quiz(ctx, id, now, own)
	if err != nil {
		return Challenge{}, fmt.Errorf("quiz list: %w", err)
	}
	return Challenge{Creator: creator, Top: top}, nil
}

// Global returns the global list; own is the requester's player, nil for none.
func (s *Service) Global(ctx context.Context, own *PlayerID) ([]Entry, error) {
	top, err := s.boards.Global(ctx, s.now(), own)
	if err != nil {
		return nil, fmt.Errorf("global list: %w", err)
	}
	return top, nil
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
		stored, err := uow.Questions()
		if err != nil {
			return fmt.Errorf("read questions: %w", err)
		}
		if len(stored) != position {
			return fmt.Errorf("quiz stores %d questions before position %d", len(stored), position)
		}
		q, err := Generate(s.cat, stored, s.rnd)
		if errors.Is(err, errQuizExhausted) {
			r.Complete(now)
			return nil
		}
		if err != nil {
			return err
		}
		if err := uow.AddQuestion(position, q); err != nil {
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
