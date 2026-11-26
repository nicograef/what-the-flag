//go:build integration

package postgres

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nicograef/what-the-flag/internal/config"
)

// TestPool opens a pool on the database the environment names and closes it
// in t.Cleanup. Missing environment fails the test, never skips it.
func TestPool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		t.Fatalf("test database: %v", err)
	}
	pool, err := NewPool(context.Background(), cfg.DatabaseURL())
	if err != nil {
		t.Fatalf("test database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestTx begins a transaction on a TestPool and rolls it back in t.Cleanup.
func TestTx(t testing.TB) pgx.Tx {
	t.Helper()
	pool := TestPool(t)
	tx, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin test transaction: %v", err)
	}
	t.Cleanup(func() {
		if err := tx.Rollback(context.Background()); err != nil {
			t.Errorf("roll back test transaction: %v", err)
		}
	})
	return tx
}
