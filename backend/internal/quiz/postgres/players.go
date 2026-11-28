package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/quiz/postgres/internal/db"
)

// Players stores anonymous players by the hash of their key.
type Players struct {
	db db.DBTX
}

// NewPlayers returns Players on d.
func NewPlayers(d db.DBTX) *Players {
	return &Players{db: d}
}

// Resolve returns the player whose key hashes to hash; ok is false for an unknown hash.
func (p *Players) Resolve(ctx context.Context, hash []byte) (id quiz.PlayerID, ok bool, err error) {
	row, err := db.New(p.db).PlayerByKeyHash(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return quiz.PlayerID{}, false, nil
	}
	if err != nil {
		return quiz.PlayerID{}, false, err
	}
	return quiz.PlayerID(row), true, nil
}

// Create stores a fresh player whose key hashes to hash.
func (p *Players) Create(ctx context.Context, hash []byte) (quiz.PlayerID, error) {
	id, err := db.New(p.db).CreatePlayer(ctx, hash)
	return quiz.PlayerID(id), err
}
