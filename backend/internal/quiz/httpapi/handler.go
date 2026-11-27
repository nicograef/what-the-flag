// Package httpapi maps the quiz routes onto the quiz core.
package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/httpx"
	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/ratelimit"
)

// Handler serves the quiz routes.
type Handler struct {
	svc    *quiz.Service
	pr     *presenter
	limits Limits
}

// Limits rate-limit run starts per client key and across all clients, and leaderboard reads per client key.
type Limits struct {
	PerClient *ratelimit.Limiter
	Global    *ratelimit.Limiter
	Reads     *ratelimit.Limiter
}

// NewLimits returns the limits: run starts 60 per client and one more every 5 s,
// 600 in all and one more every 100 ms; leaderboard reads 120 per client and one more every 500 ms.
func NewLimits(now func() time.Time) Limits {
	return Limits{
		PerClient: ratelimit.New(60, 5*time.Second, now),
		Global:    ratelimit.New(600, 100*time.Millisecond, now),
		Reads:     ratelimit.New(120, 500*time.Millisecond, now),
	}
}

// NewHandler returns a Handler over svc; cat supplies the flag keys and labels of the responses.
func NewHandler(svc *quiz.Service, cat quiz.Catalogue, limits Limits) *Handler {
	return &Handler{svc: svc, pr: newPresenter(cat), limits: limits}
}

// Register adds the quiz routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/runs", h.start)
	mux.HandleFunc("GET /api/runs/{id}", h.state)
	mux.HandleFunc("POST /api/runs/{id}/answers", h.answer)
	mux.HandleFunc("GET /api/quizzes/{id}", h.challenge)
	mux.HandleFunc("GET /api/leaderboard", h.leaderboard)
}

// allowStart takes a token from the client's and the global limiter, and answers a refusal with 429.
func (h *Handler) allowStart(w http.ResponseWriter, r *http.Request) bool {
	ok, wait := h.limits.PerClient.Allow(ratelimit.ClientKey(r))
	if ok {
		ok, wait = h.limits.Global.Allow("")
	}
	return allowed(w, r, ok, wait, "too many run starts; retry later")
}

// allowRead takes a token from the client's read limiter, and answers a refusal with 429.
func (h *Handler) allowRead(w http.ResponseWriter, r *http.Request) bool {
	ok, wait := h.limits.Reads.Allow(ratelimit.ClientKey(r))
	return allowed(w, r, ok, wait, "too many leaderboard reads; retry later")
}

// allowed answers a refusal with 429 and a Retry-After of wait in whole seconds.
func allowed(w http.ResponseWriter, r *http.Request, ok bool, wait time.Duration, message string) bool {
	if ok {
		return true
	}
	w.Header().Set("Retry-After", strconv.FormatInt(int64((wait+time.Second-1)/time.Second), 10))
	httpx.WriteError(w, r, &httpx.Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: message})
	return false
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
	if !h.allowStart(w, r) {
		return
	}
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

type challengeResponse struct {
	ID      uuid.UUID `json:"id"`
	Creator *creator  `json:"creator"`
	Top     []entry   `json:"top"`
}

type creator struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
	Ended bool   `json:"ended"`
}

func (h *Handler) challenge(w http.ResponseWriter, r *http.Request) {
	if !h.allowRead(w, r) {
		return
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.MapError(w, r, errUnparsableQuiz, errorTable)
		return
	}
	c, err := h.svc.Challenge(r.Context(), quiz.QuizID(id), ownRun(r))
	if err != nil {
		httpx.MapError(w, r, err, errorTable)
		return
	}
	body := challengeResponse{ID: id, Top: presentEntries(c.Top)}
	if v := c.Creator; v != nil {
		body.Creator = &creator{Name: v.Name, Score: v.Score, Ended: v.Ended}
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

type leaderboardResponse struct {
	Top []entry `json:"top"`
}

func (h *Handler) leaderboard(w http.ResponseWriter, r *http.Request) {
	if !h.allowRead(w, r) {
		return
	}
	top, err := h.svc.Global(r.Context(), ownRun(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, leaderboardResponse{Top: presentEntries(top)})
}

// ownRun parses the run query parameter; a missing or unparsable one names no run.
func ownRun(r *http.Request) *quiz.RunID {
	id, err := uuid.Parse(r.URL.Query().Get("run"))
	if err != nil {
		return nil
	}
	return new(quiz.RunID(id))
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
