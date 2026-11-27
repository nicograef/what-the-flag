// Package app wires the domains into one HTTP handler. Each domain adds a Deps
// field and one Register call here.
package app

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/health"
	"github.com/nicograef/what-the-flag/internal/httpx"
	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/quiz/httpapi"
	quizpg "github.com/nicograef/what-the-flag/internal/quiz/postgres"
)

// Deps holds what the handlers need.
type Deps struct {
	Pool *pgxpool.Pool
	Log  *slog.Logger
}

// New builds the API handler: the routes of every domain inside the middleware chain.
// It panics when the embedded country dataset does not load.
func New(d Deps) http.Handler {
	cat, err := country.Load()
	if err != nil {
		panic(err)
	}
	svc := quiz.NewService(quizpg.NewRepository(d.Pool), nil, cat, systemClock{}, quizpg.NewRand())

	mux := http.NewServeMux()
	health.NewHandler(d.Pool).Register(mux)
	httpapi.NewHandler(svc, cat).Register(mux)
	mux.HandleFunc("/api/", httpx.NotFound)
	return httpx.Chain(mux,
		httpx.RequestID(d.Log),
		httpx.RequestLog,
		httpx.Recover,
		httpx.CheckOrigin,
		httpx.RequireJSON,
	)
}

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now() }
