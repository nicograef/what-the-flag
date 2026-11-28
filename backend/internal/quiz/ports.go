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

// PlayerID is the id of the anonymous player a run belongs to.
type PlayerID uuid.UUID

// Catalogue is the country pool and its labels; *country.Catalogue meets it.
type Catalogue interface {
	Pool() []country.Country
	Label(kind country.LabelKind, code string) (country.Names, bool)
	Family(kind country.LabelKind, code string) string
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
	// CreateQuizWithRun stores a fresh quiz created at r.StartedAt and r as its creator run, in one transaction.
	CreateQuizWithRun(ctx context.Context, r Run) (QuizID, error)
	CreateRun(ctx context.Context, r Run) error
	// InRun calls fn in one transaction with the run locked; an unknown run is ErrRunNotFound.
	InRun(ctx context.Context, id RunID, fn func(UnitOfWork) error) error
}

// UnitOfWork is one transaction on one locked run and its quiz's questions.
type UnitOfWork interface {
	Run() *Run
	Question(position int) (Question, bool, error)
	// AddQuestion stores q unless another run stored that position first.
	AddQuestion(position int, q Question) error
	// Questions returns the quiz's stored questions by position, from 0 up to the first position without one.
	Questions() ([]Question, error)
	SaveRun(r *Run) error
}

// Leaderboards ranks players by their best ended run; a run counts as ended once its open answer is late.
// own is the requester's player, nil for none.
type Leaderboards interface {
	Global(ctx context.Context, now time.Time, own *PlayerID) ([]Entry, error)
	Quiz(ctx context.Context, id QuizID, now time.Time, own *PlayerID) ([]Entry, error)
	// Creator is nil for a hidden creator run; a quiz without a creator run is ErrQuizNotFound.
	Creator(ctx context.Context, id QuizID, now time.Time, own *PlayerID) (*CreatorView, error)
	// Ranks ranks the run's player by their best run on each list.
	Ranks(ctx context.Context, id RunID, now time.Time) (Ranks, error)
	// Best compares a finished run with its player's other ended runs.
	Best(ctx context.Context, id RunID, now time.Time) (Best, error)
	Player(ctx context.Context, id PlayerID, now time.Time) (PlayerSummary, error)
}

// Entry is one leaderboard row, a player's best run; Own marks the requester's player.
type Entry struct {
	Rank  int
	Name  string
	Score int
	Own   bool
}

// CreatorView is a quiz creator's run as the challenge page shows it; Own marks the requester's player's run.
type CreatorView struct {
	Name  string
	Score int
	Ended bool
	Own   bool
}

// Best is a finished run's player's best score over all their ended runs. IsNew holds when the run scored
// above 0 and above every other ended run of the player; Previous is the best of the player's runs that ended
// before it, nil when none did.
type Best struct {
	Score    int
	IsNew    bool
	Previous *int
}

// PlayerSummary is what a player's runs tell: the name and quiz of the latest run, the best score of an ended
// run, and the best visible ended creator run with its score. Each is nil when the player has no such run.
type PlayerSummary struct {
	LastName  *string
	LastQuiz  *QuizID
	Best      *int
	WorldRun  *RunID
	WorldBest *int
}

// Ranks is a run's player's rank on its quiz's list and, for a creator run, on the global list.
type Ranks struct {
	Quiz   int
	Global *int
}
