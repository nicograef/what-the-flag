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
	svc     *quiz.Service
	players Players
	pr      *presenter
	limits  Limits
}

// Limits rate-limit run starts and leaderboard reads. Each kind has a bucket per client key and per network
// key; run starts also share a global bucket.
type Limits struct {
	Start        *ratelimit.Limiter
	StartNetwork *ratelimit.Limiter
	StartGlobal  *ratelimit.Limiter
	Read         *ratelimit.Limiter
	ReadNetwork  *ratelimit.Limiter
}

// NewLimits returns the limits. Run starts: 60 per client and one more every 5 s, four times that per IPv6 /48,
// 600 in all and one more every 100 ms. Leaderboard reads: 120 per client and one more every 500 ms,
// four times that per IPv6 /48.
func NewLimits(now func() time.Time) Limits {
	return Limits{
		Start:        ratelimit.New(60, 5*time.Second, now),
		StartNetwork: ratelimit.New(240, 1250*time.Millisecond, now),
		StartGlobal:  ratelimit.New(600, 100*time.Millisecond, now),
		Read:         ratelimit.New(120, 500*time.Millisecond, now),
		ReadNetwork:  ratelimit.New(480, 125*time.Millisecond, now),
	}
}

// NewHandler returns a Handler over svc and players; cat supplies the flag keys and labels of the responses.
func NewHandler(svc *quiz.Service, players Players, cat quiz.Catalogue, limits Limits) *Handler {
	return &Handler{svc: svc, players: players, pr: newPresenter(cat), limits: limits}
}

// Register adds the quiz routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/runs", h.start)
	mux.HandleFunc("GET /api/runs/{id}", h.state)
	mux.HandleFunc("POST /api/runs/{id}/answers", h.answer)
	mux.HandleFunc("GET /api/quizzes/{id}", h.challenge)
	mux.HandleFunc("GET /api/leaderboard", h.leaderboard)
	mux.HandleFunc("GET /api/me", h.me)
}

// allowStart takes a token from the client's, its network's and the global bucket, and answers a refusal with 429.
func (h *Handler) allowStart(w http.ResponseWriter, r *http.Request) bool {
	steps := clientSteps(r, h.limits.Start, h.limits.StartNetwork)
	ok, wait := ratelimit.AllowAll(append(steps, ratelimit.Step{Limiter: h.limits.StartGlobal})...)
	return allowed(w, r, ok, wait, "too many run starts; retry later")
}

// allowRead takes a token from the client's and its network's read bucket, and answers a refusal with 429.
func (h *Handler) allowRead(w http.ResponseWriter, r *http.Request) bool {
	ok, wait := ratelimit.AllowAll(clientSteps(r, h.limits.Read, h.limits.ReadNetwork)...)
	return allowed(w, r, ok, wait, "too many leaderboard reads; retry later")
}

// clientSteps returns the client's bucket in perClient and, for an IPv6 client, its network's in perNetwork.
func clientSteps(r *http.Request, perClient, perNetwork *ratelimit.Limiter) []ratelimit.Step {
	client, network := ratelimit.ClientKeys(r)
	steps := []ratelimit.Step{{Limiter: perClient, Key: client}}
	if network != "" {
		steps = append(steps, ratelimit.Step{Limiter: perNetwork, Key: network})
	}
	return steps
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
	runID, qid, err := h.svc.Start(r.Context(), h.startPlayer(w, r), req.Name, quizID)
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
	Own   bool   `json:"own"`
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
	own, err := h.player(r.Context(), w, r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	c, err := h.svc.Challenge(r.Context(), quiz.QuizID(id), own)
	if err != nil {
		httpx.MapError(w, r, err, errorTable)
		return
	}
	body := challengeResponse{ID: id, Top: presentEntries(c.Top)}
	if v := c.Creator; v != nil {
		body.Creator = &creator{Name: v.Name, Score: v.Score, Ended: v.Ended, Own: v.Own}
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
	own, err := h.player(r.Context(), w, r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	top, err := h.svc.Global(r.Context(), own)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, leaderboardResponse{Top: presentEntries(top)})
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

type meResponse struct {
	LastName   *string    `json:"lastName"`
	Best       *int       `json:"best"`
	WorldRank  *int       `json:"worldRank"`
	WorldBest  *int       `json:"worldBest"`
	LastQuizID *uuid.UUID `json:"lastQuizId"`
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	player, err := h.player(r.Context(), w, r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	me, err := h.svc.Me(r.Context(), player)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	body := meResponse{LastName: me.LastName, Best: me.Best, WorldRank: me.WorldRank, WorldBest: me.WorldBest}
	if me.LastQuiz != nil {
		body.LastQuizID = new(uuid.UUID(*me.LastQuiz))
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}
