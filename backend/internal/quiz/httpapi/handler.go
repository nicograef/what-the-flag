// Package httpapi maps the quiz routes onto the quiz core.
package httpapi

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/httpx"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// Handler serves the quiz routes.
type Handler struct {
	svc *quiz.Service
	pr  *presenter
}

// NewHandler returns a Handler over svc; cat supplies the flag keys and labels of the responses.
func NewHandler(svc *quiz.Service, cat quiz.Catalogue) *Handler {
	return &Handler{svc: svc, pr: newPresenter(cat)}
}

// Register adds the quiz routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/runs", h.start)
	mux.HandleFunc("GET /api/runs/{id}", h.state)
	mux.HandleFunc("POST /api/runs/{id}/answers", h.answer)
}

type startRequest struct {
	Name   string  `json:"name"`
	QuizID *string `json:"quizId"`
}

type startResponse struct {
	RunID  uuid.UUID `json:"runId"`
	QuizID uuid.UUID `json:"quizId"`
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	var req startRequest
	if err := httpx.ReadJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	var quizID *quiz.QuizID
	if req.QuizID != nil {
		id, err := uuid.Parse(*req.QuizID)
		if err != nil {
			httpx.MapError(w, r, errUnparsableQuiz, errorTable)
			return
		}
		quizID = new(quiz.QuizID(id))
	}
	runID, qid, err := h.svc.Start(r.Context(), req.Name, quizID)
	if err != nil {
		httpx.MapError(w, r, err, errorTable)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, startResponse{RunID: uuid.UUID(runID), QuizID: uuid.UUID(qid)})
}

func (h *Handler) state(w http.ResponseWriter, r *http.Request) {
	id, ok := runID(w, r)
	if !ok {
		return
	}
	st, err := h.svc.State(r.Context(), id)
	if err != nil {
		httpx.MapError(w, r, err, errorTable)
		return
	}
	body, err := h.pr.state(st)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

type answerRequest struct {
	Position int  `json:"position"`
	Option   *int `json:"option"`
}

func (h *Handler) answer(w http.ResponseWriter, r *http.Request) {
	id, ok := runID(w, r)
	if !ok {
		return
	}
	var req answerRequest
	if err := httpx.ReadJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out, err := h.svc.Answer(r.Context(), id, req.Position, req.Option)
	if err != nil {
		httpx.MapError(w, r, err, errorTable)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, presentOutcome(out))
}

// runID parses the {id} path value; an unparsable one is answered as an unknown run.
func runID(w http.ResponseWriter, r *http.Request) (quiz.RunID, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.MapError(w, r, errUnparsableRun, errorTable)
		return quiz.RunID{}, false
	}
	return quiz.RunID(id), true
}
