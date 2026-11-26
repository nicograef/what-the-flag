// Package health serves GET /api/health, which reports whether the database answers.
package health

import (
	"context"
	"net/http"
	"time"

	"github.com/nicograef/what-the-flag/internal/httpx"
)

const pingTimeout = 2 * time.Second

// Pinger is the database check; a *pgxpool.Pool meets it.
type Pinger interface {
	Ping(context.Context) error
}

// Handler serves the health route.
type Handler struct {
	db Pinger
}

// NewHandler returns a Handler that pings p.
func NewHandler(p Pinger) *Handler {
	return &Handler{db: p}
}

// Register adds the health route to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", h.get)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), pingTimeout)
	defer cancel()
	if err := h.db.Ping(ctx); err != nil {
		httpx.Logger(r.Context()).Warn("database ping failed", "err", err)
		httpx.WriteError(w, r, &httpx.Error{Status: http.StatusServiceUnavailable, Code: "database_unavailable", Message: "database does not answer"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
