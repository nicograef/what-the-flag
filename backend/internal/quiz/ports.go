package quiz

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/nicograef/what-the-flag/internal/country"
)

// QuizID is a quiz's public id.
type QuizID uuid.UUID

// RunID is a run's private id, its only credential.
type RunID uuid.UUID

// Catalogue is the country pool and its labels; *country.Catalogue meets it.
type Catalogue interface {
	Pool() []country.Country
	Label(kind country.LabelKind, code string) (country.Names, bool)
}

// Rand is the random source; *rand.Rand of math/rand/v2 meets it.
type Rand interface {
	IntN(n int) int
	Shuffle(n int, swap func(i, j int))
}

// Clock tells the current time.
type Clock interface {
	Now() time.Time
}

// Repository stores quizzes, their questions and runs.
type Repository interface {
	CreateQuiz(ctx context.Context, now time.Time) (QuizID, error)
	CreateRun(ctx context.Context, r Run) error
	QuizExists(ctx context.Context, id QuizID) (bool, error)
	// InRun calls fn in one transaction with the run locked; an unknown run is ErrRunNotFound.
	InRun(ctx context.Context, id RunID, fn func(UnitOfWork) error) error
}

// UnitOfWork is one transaction on one locked run and its quiz's questions.
type UnitOfWork interface {
	Run() *Run
	Question(position int) (Question, bool, error)
	// AddQuestion stores q unless another run stored that position first, and returns the stored question.
	AddQuestion(position int, q Question) (Question, error)
	// Targets returns the targets of the quiz's stored questions.
	Targets() (map[string]bool, error)
	SaveRun(r *Run) error
}

// Leaderboards ranks ended runs; a run counts as ended once its open answer is late.
type Leaderboards interface {
	Global(ctx context.Context, now time.Time, own *RunID) ([]Entry, error)
	Quiz(ctx context.Context, id QuizID, now time.Time, own *RunID) ([]Entry, error)
	// Creator is nil for a hidden creator run; a quiz without a creator run is ErrQuizNotFound.
	Creator(ctx context.Context, id QuizID, now time.Time) (*CreatorView, error)
	Ranks(ctx context.Context, id RunID, now time.Time) (Ranks, error)
}

// Entry is one leaderboard row; Own marks the requester's run.
type Entry struct {
	Rank  int
	Name  string
	Score int
	Own   bool
}

// CreatorView is a quiz creator's run as the challenge page shows it.
type CreatorView struct {
	Name  string
	Score int
	Ended bool
}

// Ranks is a run's rank on its quiz's list and, for a creator, on the global list.
type Ranks struct {
	Quiz   int
	Global *int
}
