// Package postgres opens the connection pool and provides test helpers.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	pingBudget   = 30 * time.Second
	pingInterval = time.Second
)

// NewPool opens a pool on url and waits up to 30 s for the database to answer.
func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := PingWithRetry(ctx, pool.Ping, pingBudget, pingInterval); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// PingWithRetry calls ping every interval until it succeeds, budget is spent
// or ctx is done.
func PingWithRetry(ctx context.Context, ping func(context.Context) error, budget, interval time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		err := ping(ctx)
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return fmt.Errorf("ping database: %w", errors.Join(ctx.Err(), err))
		}
		select {
		case <-ctx.Done():
		case <-ticker.C:
		}
	}
}
