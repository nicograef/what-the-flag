// Package app wires the domains into one HTTP handler. Each domain adds a Deps
// field and one Register call here.
package app

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nicograef/what-the-flag/internal/health"
	"github.com/nicograef/what-the-flag/internal/httpx"
)

// Deps holds what the handlers need.
type Deps struct {
	Pool *pgxpool.Pool
	Log  *slog.Logger
}

// New builds the API handler: the routes of every domain inside the middleware chain.
func New(d Deps) http.Handler {
	mux := http.NewServeMux()
	health.NewHandler(d.Pool).Register(mux)
	mux.HandleFunc("/api/", httpx.NotFound)
	return httpx.Chain(mux,
		httpx.RequestID(d.Log),
		httpx.RequestLog,
		httpx.Recover,
		httpx.CheckOrigin,
		httpx.RequireJSON,
	)
}
