//go:build integration

package contract

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/postgres"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

type started struct {
	RunID  string `json:"runId"`
	QuizID string `json:"quizId"`
}

type names struct {
	De string `json:"de"`
	En string `json:"en"`
}

type item struct {
	Kind    string `json:"kind"`
	FlagKey string `json:"flagKey,omitempty"`
	Text    names  `json:"text"`
}

type question struct {
	Position int       `json:"position"`
	Type     string    `json:"type"`
	Prompt   item      `json:"prompt"`
	Options  [4]item   `json:"options"`
	Deadline time.Time `json:"deadline"`
}

type missed struct {
	Position      int     `json:"position"`
	Type          string  `json:"type"`
	Prompt        item    `json:"prompt"`
	Options       [4]item `json:"options"`
	CorrectOption int     `json:"correctOption"`
	ChosenOption  *int    `json:"chosenOption"`
}

type result struct {
	Score      int     `json:"score"`
	EndReason  string  `json:"endReason"`
	Last       *missed `json:"last"`
	QuizRank   int     `json:"quizRank"`
	GlobalRank *int    `json:"globalRank"`
}

type entry struct {
	Rank  int    `json:"rank"`
	Name  string `json:"name"`
	Score int    `json:"score"`
	Own   bool   `json:"own"`
}

type creatorView struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
	Ended bool   `json:"ended"`
}

type challenge struct {
	ID      string       `json:"id"`
	Creator *creatorView `json:"creator"`
	Top     []entry      `json:"top"`
}

type leaderboard struct {
	Top []entry `json:"top"`
}

type runState struct {
	ID        string    `json:"id"`
	QuizID    string    `json:"quizId"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Score     int       `json:"score"`
	ServerNow time.Time `json:"serverNow"`
	Question  *question `json:"question"`
	Result    *result   `json:"result"`
}

type outcome struct {
	Position      int  `json:"position"`
	Correct       bool `json:"correct"`
	TimedOut      bool `json:"timedOut"`
	ChosenOption  *int `json:"chosenOption"`
	CorrectOption int  `json:"correctOption"`
	Finished      bool `json:"finished"`
	Score         int  `json:"score"`
}

type answerBody struct {
	Position int  `json:"position"`
	Option   *int `json:"option"`
}

// decodeQuiz is decode that first fails on any JSON string equal to a pool code.
func decodeQuiz[T any](t *testing.T, resp *http.Response, status int) T {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("parse %s: %v", body, err)
	}
	if code, ok := poolCodeIn(t, v); ok {
		t.Fatalf("response carries pool code %q: %s", code, body)
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return decode[T](t, resp, status)
}

func poolCodeIn(t *testing.T, v any) (string, bool) {
	t.Helper()
	switch v := v.(type) {
	case string:
		_, ok := poolCodes(t)[v]
		return v, ok
	case []any:
		for _, e := range v {
			if code, ok := poolCodeIn(t, e); ok {
				return code, true
			}
		}
	case map[string]any:
		for _, e := range v {
			if code, ok := poolCodeIn(t, e); ok {
				return code, true
			}
		}
	}
	return "", false
}

func poolCodes(t *testing.T) map[string]bool {
	t.Helper()
	cat, err := country.Load()
	if err != nil {
		t.Fatalf("load catalogue: %v", err)
	}
	codes := map[string]bool{}
	for _, c := range cat.Pool() {
		codes[c.Code] = true
	}
	return codes
}

// correctOption reads the correct option of a run's question at position from the database.
func correctOption(t *testing.T, runID string, position int) int {
	t.Helper()
	var correct int
	err := postgres.TestPool(t).QueryRow(context.Background(), `
		SELECT q.correct_index FROM runs r
		JOIN quiz_questions q ON q.quiz_id = r.quiz_id
		WHERE r.id = $1 AND q.position = $2`, runID, position).Scan(&correct)
	if err != nil {
		t.Fatalf("correct option of %s at %d: %v", runID, position, err)
	}
	return correct
}

func startRun(t *testing.T, c *client, body map[string]any) started {
	t.Helper()
	return decodeQuiz[started](t, c.post("/api/runs", body), http.StatusCreated)
}

func readState(t *testing.T, c *client, runID string) runState {
	t.Helper()
	return decodeQuiz[runState](t, c.get("/api/runs/"+runID), http.StatusOK)
}

func answer(t *testing.T, c *client, runID string, position int, option *int) outcome {
	t.Helper()
	return decodeQuiz[outcome](t, c.post("/api/runs/"+runID+"/answers", answerBody{position, option}), http.StatusOK)
}

// answerCorrectly waits out quiz.MinAnswer, under which a correct answer counts as wrong.
func answerCorrectly(t *testing.T, c *client, runID string, position int) outcome {
	t.Helper()
	time.Sleep(quiz.MinAnswer + 50*time.Millisecond)
	return answer(t, c, runID, position, new(correctOption(t, runID, position)))
}

func TestRun(t *testing.T) {
	c := newClient(t, newServer(t))
	s := startRun(t, c, map[string]any{"name": "  Ada   Lovelace "})

	st := readState(t, c, s.RunID)
	if st.ID != s.RunID || st.QuizID != s.QuizID || st.Name != "Ada Lovelace" || st.Status != "playing" ||
		st.Score != 0 || st.Result != nil || st.Question == nil || st.Question.Position != 0 {
		t.Fatalf("first state = %+v", st)
	}
	if want := st.ServerNow.Add(quiz.Limit); st.Question.Deadline.After(want) || st.Question.Deadline.Before(st.ServerNow) {
		t.Fatalf("deadline %v not within 15 s of serving at %v", st.Question.Deadline, st.ServerNow)
	}
	if again := readState(t, c, s.RunID); again.Question == nil || *again.Question != *st.Question {
		t.Fatalf("second read = %+v, want the served question %+v", again.Question, st.Question)
	}

	for position := range 2 {
		got := answerCorrectly(t, c, s.RunID, position)
		if !got.Correct || got.Finished || got.Score != position+1 || got.Position != position {
			t.Fatalf("correct answer at %d = %+v", position, got)
		}
		if next := readState(t, c, s.RunID); next.Question == nil || next.Question.Position != position+1 {
			t.Fatalf("after answer %d: question = %+v", position, next.Question)
		}
	}

	right := correctOption(t, s.RunID, 2)
	wrong := (right + 1) % 4
	want := outcome{Position: 2, ChosenOption: &wrong, CorrectOption: right, Finished: true, Score: 2}
	if got := answer(t, c, s.RunID, 2, &wrong); !sameOutcome(got, want) {
		t.Fatalf("wrong answer = %+v, want %+v", got, want)
	}
	if got := answer(t, c, s.RunID, 2, &right); !sameOutcome(got, want) {
		t.Fatalf("repeat answer = %+v, want the stored %+v", got, want)
	}

	end := readState(t, c, s.RunID)
	if end.Status != "finished" || end.Question != nil || end.Result == nil ||
		end.Result.Score != 2 || end.Result.EndReason != "wrong" || end.Result.Last == nil ||
		end.Result.QuizRank != 1 || end.Result.GlobalRank == nil || *end.Result.GlobalRank < 1 {
		t.Fatalf("final state = %+v", end)
	}
	if last := end.Result.Last; last.Position != 2 || last.CorrectOption != right ||
		last.ChosenOption == nil || *last.ChosenOption != wrong {
		t.Fatalf("last = %+v, want position 2, correct %d, chosen %d", last, right, wrong)
	}
}

func sameOutcome(a, b outcome) bool {
	return a.Position == b.Position && a.Correct == b.Correct && a.TimedOut == b.TimedOut &&
		(a.ChosenOption == nil) == (b.ChosenOption == nil) &&
		(a.ChosenOption == nil || *a.ChosenOption == *b.ChosenOption) &&
		a.CorrectOption == b.CorrectOption && a.Finished == b.Finished && a.Score == b.Score
}

func TestRunErrors(t *testing.T) {
	c := newClient(t, newServer(t))
	s := startRun(t, c, map[string]any{"name": "errors"})
	readState(t, c, s.RunID)
	const unknown = "00000000-0000-4000-8000-000000000000"

	tests := []struct {
		name   string
		resp   func() *http.Response
		status int
		code   string
		field  string
	}{
		{"blank name", func() *http.Response { return c.post("/api/runs", map[string]any{"name": "   "}) },
			http.StatusBadRequest, "invalid_name", "name"},
		{"unknown quizId", func() *http.Response { return c.post("/api/runs", map[string]any{"name": "a", "quizId": unknown}) },
			http.StatusNotFound, "quiz_not_found", ""},
		{"unparsable quizId", func() *http.Response { return c.post("/api/runs", map[string]any{"name": "a", "quizId": "nope"}) },
			http.StatusNotFound, "quiz_not_found", ""},
		{"unknown run", func() *http.Response { return c.get("/api/runs/" + unknown) },
			http.StatusNotFound, "run_not_found", ""},
		{"unparsable run", func() *http.Response { return c.get("/api/runs/nope") },
			http.StatusNotFound, "run_not_found", ""},
		{"unknown run answer", func() *http.Response { return c.post("/api/runs/"+unknown+"/answers", answerBody{0, new(0)}) },
			http.StatusNotFound, "run_not_found", ""},
		{"never-served position", func() *http.Response { return c.post("/api/runs/"+s.RunID+"/answers", answerBody{1, new(0)}) },
			http.StatusConflict, "not_current_question", ""},
		{"option 4", func() *http.Response { return c.post("/api/runs/"+s.RunID+"/answers", answerBody{0, new(4)}) },
			http.StatusBadRequest, "invalid_option", "option"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := expectError(t, tt.resp(), tt.status, tt.code); got.Field != tt.field {
				t.Fatalf("field = %q, want %q", got.Field, tt.field)
			}
		})
	}
}

func TestRunOnQuiz(t *testing.T) {
	srv := newServer(t)
	first, second := newClient(t, srv), newClient(t, srv)
	a := startRun(t, first, map[string]any{"name": "creator"})
	qa := readState(t, first, a.RunID).Question

	b := startRun(t, second, map[string]any{"name": "challenger", "quizId": a.QuizID})
	if b.QuizID != a.QuizID || b.RunID == a.RunID {
		t.Fatalf("challenger run = %+v, creator %+v", b, a)
	}
	qb := readState(t, second, b.RunID).Question
	if qa == nil || qb == nil || qa.Type != qb.Type || qa.Prompt != qb.Prompt || qa.Options != qb.Options {
		t.Fatalf("challenger question = %+v, want the creator's %+v", qb, qa)
	}
}

// answerWrong ends a run with a wrong answer at position.
func answerWrong(t *testing.T, c *client, runID string, position int) outcome {
	t.Helper()
	return answer(t, c, runID, position, new((correctOption(t, runID, position)+1)%4))
}

func TestChallenge(t *testing.T) {
	srv := newServer(t)
	first, second := newClient(t, srv), newClient(t, srv)
	a := startRun(t, first, map[string]any{"name": "creator"})
	readState(t, first, a.RunID)

	view := decodeQuiz[challenge](t, first.get("/api/quizzes/"+a.QuizID), http.StatusOK)
	if view.ID != a.QuizID || view.Creator == nil || *view.Creator != (creatorView{Name: "creator"}) || len(view.Top) != 0 {
		t.Fatalf("view while the creator plays = %+v", view)
	}

	answerCorrectly(t, first, a.RunID, 0)
	readState(t, first, a.RunID)
	answerWrong(t, first, a.RunID, 1)
	view = decodeQuiz[challenge](t, first.get("/api/quizzes/"+a.QuizID), http.StatusOK)
	if view.Creator == nil || *view.Creator != (creatorView{Name: "creator", Score: 1, Ended: true}) ||
		len(view.Top) != 1 || view.Top[0] != (entry{Rank: 1, Name: "creator", Score: 1}) {
		t.Fatalf("view after the creator ended = %+v", view)
	}

	b := startRun(t, second, map[string]any{"name": "challenger", "quizId": a.QuizID})
	readState(t, second, b.RunID)
	answerWrong(t, second, b.RunID, 0)
	res := readState(t, second, b.RunID).Result
	if res == nil || res.QuizRank != 2 || res.GlobalRank != nil {
		t.Fatalf("challenger result = %+v, want quiz rank 2 and no global rank", res)
	}

	view = decodeQuiz[challenge](t, second.get("/api/quizzes/"+a.QuizID+"?run="+b.RunID), http.StatusOK)
	want := []entry{{Rank: 1, Name: "creator", Score: 1}, {Rank: 2, Name: "challenger", Own: true}}
	if len(view.Top) != 2 || view.Top[0] != want[0] || view.Top[1] != want[1] {
		t.Fatalf("quiz list = %+v, want %+v", view.Top, want)
	}
	global := decodeQuiz[leaderboard](t, second.get("/api/leaderboard?run="+b.RunID), http.StatusOK)
	for _, e := range global.Top {
		if e.Own {
			t.Fatalf("global list holds the challenger's run: %+v", e)
		}
	}

	const unknown = "00000000-0000-4000-8000-000000000000"
	expectError(t, first.get("/api/quizzes/"+unknown), http.StatusNotFound, "quiz_not_found")
	expectError(t, first.get("/api/quizzes/nope"), http.StatusNotFound, "quiz_not_found")
	decodeQuiz[challenge](t, first.get("/api/quizzes/"+a.QuizID+"?run=nope"), http.StatusOK)

	// make hide: the creator's name is never served again, and the quiz stays playable.
	if _, err := postgres.TestPool(t).Exec(context.Background(),
		`UPDATE runs SET hidden = true WHERE id = $1`, a.RunID); err != nil {
		t.Fatalf("hide creator: %v", err)
	}
	view = decodeQuiz[challenge](t, first.get("/api/quizzes/"+a.QuizID), http.StatusOK)
	if view.Creator != nil || len(view.Top) != 1 || view.Top[0].Name != "challenger" {
		t.Fatalf("view after hiding the creator = %+v, want no creator and only the challenger", view)
	}
	startRun(t, second, map[string]any{"name": "late", "quizId": a.QuizID})
}

func TestRateLimit(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	for i := range 60 {
		if resp := c.post("/api/runs", map[string]any{"name": "limit"}); resp.StatusCode != http.StatusCreated {
			t.Fatalf("start %d: status %d, want 201", i+1, resp.StatusCode)
		} else {
			_ = resp.Body.Close()
		}
	}
	resp := c.post("/api/runs", map[string]any{"name": "limit"})
	if retry, err := strconv.Atoi(resp.Header.Get("Retry-After")); err != nil || retry < 1 {
		t.Fatalf("Retry-After = %q, want whole seconds", resp.Header.Get("Retry-After"))
	}
	expectError(t, resp, http.StatusTooManyRequests, "rate_limited")
	startRun(t, newClient(t, srv), map[string]any{"name": "other"})
}
