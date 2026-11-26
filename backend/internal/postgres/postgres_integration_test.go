//go:build integration

package postgres

import (
	"context"
	"crypto/rand"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/nicograef/what-the-flag/internal/postgres/internal/db"
)

func TestTxRollsBack(t *testing.T) {
	ctx := context.Background()
	key := "test-" + rand.Text()
	t.Run("insert on TestTx", func(t *testing.T) {
		tx := TestTx(t)
		if _, err := tx.Exec(ctx, "INSERT INTO app_meta (key, value) VALUES ($1, 'v')", key); err != nil {
			t.Fatalf("insert: %v", err)
		}
		if got, err := db.New(tx).GetMeta(ctx, key); err != nil || got != "v" {
			t.Fatalf("GetMeta in tx = %q, %v", got, err)
		}
	})
	_, err := db.New(TestPool(t)).GetMeta(ctx, key)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GetMeta after rollback: err = %v, want pgx.ErrNoRows", err)
	}
}
