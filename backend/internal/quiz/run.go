package quiz

import "time"

// Answer timing: a question allows Limit plus Grace; an answer before MinAnswer counts as wrong.
const (
	Limit     = 15 * time.Second
	Grace     = 2 * time.Second
	MinAnswer = 300 * time.Millisecond
)

// EndReason says why a run ended; it is empty while the run plays.
type EndReason string

const (
	EndWrong     EndReason = "wrong"
	EndTimeout   EndReason = "timeout"
	EndCompleted EndReason = "completed"
)

// Run is one visitor's pass through a quiz.
type Run struct {
	ID         RunID
	QuizID     QuizID
	Name       string
	Creator    bool
	Score      int
	StartedAt  time.Time
	FinishedAt *time.Time
	EndReason  EndReason
	Hidden     bool
	Answers    []Answer
}

// Answer is a served question of a run. It is open while Correct is nil; a run has at most one open answer.
type Answer struct {
	Position   int
	ServedAt   time.Time
	AnsweredAt *time.Time
	Option     *int
	Correct    *bool
}

// Outcome is the result of an answer; ChosenOption is nil for a timeout.
type Outcome struct {
	Position      int
	Correct       bool
	TimedOut      bool
	ChosenOption  *int
	CorrectOption int
	Finished      bool
	Score         int
}

// Finished reports whether the run has ended.
func (r *Run) Finished() bool { return r.EndReason != "" }

// open returns the open answer, or nil.
func (r *Run) open() *Answer {
	for i := range r.Answers {
		if r.Answers[i].Correct == nil {
			return &r.Answers[i]
		}
	}
	return nil
}

func (r *Run) answer(position int) *Answer {
	for i := range r.Answers {
		if r.Answers[i].Position == position {
			return &r.Answers[i]
		}
	}
	return nil
}

func (r *Run) end(reason EndReason, at time.Time) {
	r.EndReason = reason
	r.FinishedAt = &at
}

// Expire turns an open answer that is late at now into a timeout, which ends the run at its deadline plus grace.
func (r *Run) Expire(now time.Time) {
	a := r.open()
	if a == nil {
		return
	}
	end := a.ServedAt.Add(Limit + Grace)
	if !now.After(end) {
		return
	}
	a.Correct = new(false)
	a.AnsweredAt, a.Option = nil, nil
	r.end(EndTimeout, end)
}

// Serve opens the answer at position, which must be the run's score, while the run plays with no open answer.
func (r *Run) Serve(position int, now time.Time) error {
	if r.Finished() || r.open() != nil || position != r.Score {
		return ErrNotCurrentQuestion
	}
	r.Answers = append(r.Answers, Answer{Position: position, ServedAt: now})
	return nil
}

// Complete ends a playing run with no open answer as completed: no unused country is left.
func (r *Run) Complete(now time.Time) {
	if r.Finished() || r.open() != nil {
		return
	}
	r.end(EndCompleted, now)
}

// Answer answers the question at position with option, nil for no answer. The correct option is correctIndex.
// A resolved position returns its stored outcome and changes nothing.
func (r *Run) Answer(position int, option *int, correctIndex int, now time.Time) (Outcome, error) {
	if err := checkOption(option); err != nil {
		return Outcome{}, err
	}
	r.Expire(now)
	a := r.answer(position)
	if a == nil {
		return Outcome{}, ErrNotCurrentQuestion
	}
	if a.Correct == nil {
		correct := option != nil && *option == correctIndex && now.Sub(a.ServedAt) >= MinAnswer
		a.AnsweredAt, a.Correct = &now, &correct
		if option != nil {
			a.Option = new(*option)
		}
		switch {
		case correct:
			r.Score++
		case option == nil:
			r.end(EndTimeout, now)
		default:
			r.end(EndWrong, now)
		}
	}
	return Outcome{
		Position:      position,
		Correct:       *a.Correct,
		TimedOut:      !*a.Correct && a.Option == nil,
		ChosenOption:  a.Option,
		CorrectOption: correctIndex,
		Finished:      r.Finished(),
		Score:         r.Score,
	}, nil
}

func checkOption(option *int) error {
	if option != nil && (*option < 0 || *option > 3) {
		return ErrInvalidOption
	}
	return nil
}
