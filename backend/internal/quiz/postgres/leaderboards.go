package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/quiz/postgres/internal/db"
)

// Leaderboards ranks the ended runs stored in Postgres.
type Leaderboards struct {
	db db.DBTX
}

var _ quiz.Leaderboards = (*Leaderboards)(nil)

// NewLeaderboards returns Leaderboards on d.
func NewLeaderboards(d db.DBTX) *Leaderboards {
	return &Leaderboards{db: d}
}

// lateAfter is how long an open answer stays open; past it the run counts as ended.
var lateAfter = pgtype.Interval{Microseconds: (quiz.Limit + quiz.Grace).Microseconds(), Valid: true}

// Global returns the top players by their best ended creator run.
func (l *Leaderboards) Global(ctx context.Context, now time.Time, own *quiz.PlayerID) ([]quiz.Entry, error) {
	rows, err := db.New(l.db).GlobalTop(ctx, db.GlobalTopParams{LateAfter: lateAfter, Now: now})
	if err != nil {
		return nil, err
	}
	entries := make([]quiz.Entry, len(rows))
	for i, r := range rows {
		entries[i] = entry(r.PlayerID, r.Name, r.Score, r.Rank, own)
	}
	return entries, nil
}

// Quiz returns the top players of a quiz by their best ended run on it.
func (l *Leaderboards) Quiz(ctx context.Context, id quiz.QuizID, now time.Time, own *quiz.PlayerID) ([]quiz.Entry, error) {
	rows, err := db.New(l.db).QuizTop(ctx, db.QuizTopParams{LateAfter: lateAfter, QuizID: uuid.UUID(id), Now: now})
	if err != nil {
		return nil, err
	}
	entries := make([]quiz.Entry, len(rows))
	for i, r := range rows {
		entries[i] = entry(r.PlayerID, r.Name, r.Score, r.Rank, own)
	}
	return entries, nil
}

// Creator returns the quiz's creator run, nil when it is hidden; a quiz without one is ErrQuizNotFound.
func (l *Leaderboards) Creator(ctx context.Context, id quiz.QuizID, now time.Time, own *quiz.PlayerID) (*quiz.CreatorView, error) {
	row, err := db.New(l.db).CreatorRun(ctx, db.CreatorRunParams{LateAfter: lateAfter, Now: now, QuizID: uuid.UUID(id)})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, quiz.ErrQuizNotFound
	}
	if err != nil {
		return nil, err
	}
	if row.Hidden {
		return nil, nil
	}
	return &quiz.CreatorView{Name: row.Name, Score: int(row.Score), Ended: row.Ended, Own: isOwn(row.PlayerID, own)}, nil
}

// Ranks returns the run's player's rank on its quiz's list and, for a creator run, on the global list.
func (l *Leaderboards) Ranks(ctx context.Context, id quiz.RunID, now time.Time) (quiz.Ranks, error) {
	row, err := db.New(l.db).RunRanks(ctx, db.RunRanksParams{ID: uuid.UUID(id), LateAfter: lateAfter, Now: now})
	if errors.Is(err, pgx.ErrNoRows) {
		return quiz.Ranks{}, quiz.ErrRunNotFound
	}
	if err != nil {
		return quiz.Ranks{}, err
	}
	ranks := quiz.Ranks{Quiz: int(row.QuizRank)}
	if row.Creator {
		ranks.Global = new(int(row.GlobalRank))
	}
	return ranks, nil
}

func entry(player uuid.UUID, name string, score int32, rank int64, own *quiz.PlayerID) quiz.Entry {
	return quiz.Entry{Rank: int(rank), Name: name, Score: int(score), Own: isOwn(player, own)}
}

func isOwn(player uuid.UUID, own *quiz.PlayerID) bool {
	return own != nil && uuid.UUID(*own) == player
}
