//go:build integration

package contract

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
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
	LimitMs  int64     `json:"limitMs"`
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
	Best       best    `json:"best"`
}

type best struct {
	Score    int  `json:"score"`
	IsNew    bool `json:"isNew"`
	Previous *int `json:"previous"`
}

type me struct {
	LastName   *string `json:"lastName"`
	Best       *int    `json:"best"`
	WorldRank  *int    `json:"worldRank"`
	WorldBest  *int    `json:"worldBest"`
	LastQuizID *string `json:"lastQuizId"`
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
	Own   bool   `json:"own"`
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
	codes, err := poolCodes()
	if err != nil {
		t.Fatalf("load catalogue: %v", err)
	}
	if code, ok := poolCodeIn(codes, v); ok {
		t.Fatalf("response carries pool code %q: %s", code, body)
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return decode[T](t, resp, status)
}

// decodeGolden is decodeQuiz that also compares the body with its golden file; edit is as for golden.
func decodeGolden[T any](t *testing.T, name string, resp *http.Response, status int, edit func(map[string]any)) T {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	golden(t, name, body, edit)
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return decodeQuiz[T](t, resp, status)
}

func poolCodeIn(codes map[string]bool, v any) (string, bool) {
	switch v := v.(type) {
	case string:
		return v, codes[v]
	case []any:
		for _, e := range v {
			if code, ok := poolCodeIn(codes, e); ok {
				return code, true
			}
		}
	case map[string]any:
		for _, e := range v {
			if code, ok := poolCodeIn(codes, e); ok {
				return code, true
			}
		}
	}
	return "", false
}

// poolCodes is the set of pool country codes, parsed from the embedded dataset once.
var poolCodes = sync.OnceValues(func() (map[string]bool, error) {
	cat, err := country.Load()
	if err != nil {
		return nil, err
	}
	codes := map[string]bool{}
	for _, c := range cat.Pool() {
		codes[c.Code] = true
	}
	return codes, nil
})

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

// pinQuestion replaces the stored question of runID's quiz at position with a fixed question about DE
// of type typ, whose correct option is 0, so a golden file holds the same question on every test run.
// prompt is the stored prompt, empty for a type without one.
func pinQuestion(t *testing.T, runID string, position int, typ, prompt string) {
	t.Helper()
	tag, err := postgres.TestPool(t).Exec(context.Background(), `
		UPDATE quiz_questions q
		SET type = $3, target = 'DE', prompt = NULLIF($4, ''), options = '{DE,FR,IT,ES}', correct_index = 0
		FROM runs r WHERE r.id = $1 AND q.quiz_id = r.quiz_id AND q.position = $2`, runID, position, typ, prompt)
	if err != nil || tag.RowsAffected() != 1 {
		t.Fatalf("pin question %d of %s: %v, %d rows", position, runID, err, tag.RowsAffected())
	}
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
	s := decodeGolden[started](t, "start", c.post("/api/runs", map[string]any{"name": "  Ada   Lovelace "}),
		http.StatusCreated, nil)

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
	pinQuestion(t, s.RunID, 0, "flag_name", "")
	decodeGolden[runState](t, "run-playing", c.get("/api/runs/"+s.RunID), http.StatusOK, nil)

	for position := range 2 {
		got := answerCorrectly(t, c, s.RunID, position)
		if !got.Correct || got.Finished || got.Score != position+1 || got.Position != position {
			t.Fatalf("correct answer at %d = %+v", position, got)
		}
		if next := readState(t, c, s.RunID); next.Question == nil || next.Question.Position != position+1 {
			t.Fatalf("after answer %d: question = %+v", position, next.Question)
		}
	}

	pinQuestion(t, s.RunID, 2, "regional_language_name", "hsb")
	right, wrong := 0, 1
	want := outcome{Position: 2, ChosenOption: &wrong, CorrectOption: right, Finished: true, Score: 2}
	got := decodeGolden[outcome](t, "outcome-wrong",
		c.post("/api/runs/"+s.RunID+"/answers", answerBody{2, &wrong}), http.StatusOK, nil)
	if !sameOutcome(got, want) {
		t.Fatalf("wrong answer = %+v, want %+v", got, want)
	}
	if got := answer(t, c, s.RunID, 2, &right); !sameOutcome(got, want) {
		t.Fatalf("repeat answer = %+v, want the stored %+v", got, want)
	}

	end := decodeGolden[runState](t, "run-finished", c.get("/api/runs/"+s.RunID), http.StatusOK, nil)
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

func TestTimeout(t *testing.T) {
	c := newClient(t, newServer(t))

	t.Run("null answer", func(t *testing.T) {
		s := startRun(t, c, map[string]any{"name": "silent"})
		readState(t, c, s.RunID)
		pinQuestion(t, s.RunID, 0, "flag_name", "")
		got := decodeGolden[outcome](t, "outcome-timeout",
			c.post("/api/runs/"+s.RunID+"/answers", answerBody{0, nil}), http.StatusOK, nil)
		if want := (outcome{TimedOut: true, Finished: true}); !sameOutcome(got, want) {
			t.Fatalf("null answer = %+v, want %+v", got, want)
		}
		end := decodeGolden[runState](t, "run-timeout", c.get("/api/runs/"+s.RunID), http.StatusOK, nil)
		if end.Result == nil || end.Result.EndReason != "timeout" || end.Result.Last == nil ||
			end.Result.Last.ChosenOption != nil {
			t.Fatalf("state after a null answer = %+v, want a timeout with no chosen option", end)
		}
		expectStoredTimeout(t, s.RunID)
	})

	t.Run("late answer", func(t *testing.T) {
		s := startRun(t, c, map[string]any{"name": "late"})
		readState(t, c, s.RunID)
		if _, err := postgres.TestPool(t).Exec(context.Background(),
			`UPDATE run_answers SET served_at = served_at - interval '18 seconds' WHERE run_id = $1`, s.RunID); err != nil {
			t.Fatalf("age answer: %v", err)
		}
		if st := readState(t, c, s.RunID); st.Result == nil || st.Result.EndReason != "timeout" {
			t.Fatalf("state past the deadline = %+v, want a timeout", st)
		}
		expectStoredTimeout(t, s.RunID)
	})
}

// expectStoredTimeout checks that the database holds runID as ended by a timeout at position 0.
func expectStoredTimeout(t *testing.T, runID string) {
	t.Helper()
	var reason *string
	var finished bool
	var correct *bool
	var option *int16
	err := postgres.TestPool(t).QueryRow(context.Background(), `
		SELECT r.end_reason, r.finished_at IS NOT NULL, a.correct, a.option_index
		FROM runs r JOIN run_answers a ON a.run_id = r.id AND a.position = 0
		WHERE r.id = $1`, runID).Scan(&reason, &finished, &correct, &option)
	if err != nil {
		t.Fatalf("read stored run %s: %v", runID, err)
	}
	if reason == nil || *reason != "timeout" || !finished || correct == nil || *correct || option != nil {
		t.Fatalf("stored run: end %v, finished %t, correct %v, option %v; want a timeout with no option",
			reason, finished, correct, option)
	}
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
	if view.ID != a.QuizID || view.Creator == nil || *view.Creator != (creatorView{Name: "creator", Own: true}) || len(view.Top) != 0 {
		t.Fatalf("view while the creator plays = %+v", view)
	}
	expectError(t, second.post("/api/runs", map[string]any{"name": "scout", "quizId": a.QuizID}),
		http.StatusConflict, "quiz_in_progress")

	answerCorrectly(t, first, a.RunID, 0)
	readState(t, first, a.RunID)
	answerWrong(t, first, a.RunID, 1)
	view = decodeQuiz[challenge](t, first.get("/api/quizzes/"+a.QuizID), http.StatusOK)
	if view.Creator == nil || *view.Creator != (creatorView{Name: "creator", Score: 1, Ended: true, Own: true}) ||
		len(view.Top) != 1 || view.Top[0] != (entry{Rank: 1, Name: "creator", Score: 1, Own: true}) {
		t.Fatalf("view after the creator ended = %+v", view)
	}

	b := startRun(t, second, map[string]any{"name": "challenger", "quizId": a.QuizID})
	readState(t, second, b.RunID)
	answerWrong(t, second, b.RunID, 0)
	res := readState(t, second, b.RunID).Result
	if res == nil || res.QuizRank != 2 || res.GlobalRank != nil {
		t.Fatalf("challenger result = %+v, want quiz rank 2 and no global rank", res)
	}

	view = decodeGolden[challenge](t, "challenge", second.get("/api/quizzes/"+a.QuizID), http.StatusOK, nil)
	want := []entry{{Rank: 1, Name: "creator", Score: 1}, {Rank: 2, Name: "challenger", Own: true}}
	if len(view.Top) != 2 || view.Top[0] != want[0] || view.Top[1] != want[1] {
		t.Fatalf("quiz list = %+v, want %+v", view.Top, want)
	}
	// The global list holds every run the database holds, so its golden keeps the first row with fixed values.
	global := decodeGolden[leaderboard](t, "leaderboard", second.get("/api/leaderboard"), http.StatusOK,
		func(m map[string]any) {
			top := m["top"].([]any)[:1]
			first := top[0].(map[string]any)
			first["name"], first["score"] = "creator", 1
			m["top"] = top
		})
	for _, e := range global.Top {
		if e.Own {
			t.Fatalf("global list holds the challenger, who created no quiz: %+v", e)
		}
	}

	const unknown = "00000000-0000-4000-8000-000000000000"
	expectError(t, first.get("/api/quizzes/"+unknown), http.StatusNotFound, "quiz_not_found")
	expectError(t, first.get("/api/quizzes/nope"), http.StatusNotFound, "quiz_not_found")

	// make hide: the creator's name is never served again, and the quiz stays playable.
	if _, err := postgres.TestPool(t).Exec(context.Background(),
		`UPDATE runs SET hidden = true WHERE player_id = (SELECT player_id FROM runs WHERE id = $1)`, a.RunID); err != nil {
		t.Fatalf("hide creator: %v", err)
	}
	view = decodeGolden[challenge](t, "challenge-hidden", first.get("/api/quizzes/"+a.QuizID), http.StatusOK, nil)
	if view.Creator != nil || len(view.Top) != 1 || view.Top[0].Name != "challenger" {
		t.Fatalf("view after hiding the creator = %+v, want no creator and only the challenger", view)
	}
	startRun(t, second, map[string]any{"name": "late", "quizId": a.QuizID})
}

// runPlayer reads the player a run belongs to from the database.
func runPlayer(t *testing.T, runID string) string {
	t.Helper()
	var player string
	if err := postgres.TestPool(t).QueryRow(context.Background(),
		`SELECT player_id FROM runs WHERE id = $1`, runID).Scan(&player); err != nil {
		t.Fatalf("player of run %s: %v", runID, err)
	}
	return player
}

// playerCookie returns the player cookie resp sets, failing the test without exactly one.
func playerCookie(t *testing.T, resp *http.Response) *http.Cookie {
	t.Helper()
	var found []*http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "wtf_player" {
			found = append(found, c)
		}
	}
	if len(found) != 1 {
		t.Fatalf("response sets %d player cookies, want 1: %v", len(found), resp.Header.Values("Set-Cookie"))
	}
	return found[0]
}

func TestPlayerKey(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)

	resp := c.post("/api/runs", map[string]any{"name": "keyed"})
	key := playerCookie(t, resp)
	if !key.HttpOnly || !key.Secure || key.SameSite != http.SameSiteLaxMode || key.Path != "/api" ||
		key.MaxAge != 34560000 || len(key.Value) != 43 {
		t.Fatalf("player cookie = %+v, want HttpOnly, Secure, SameSite=Lax, Path=/api, 400 days, 43 characters", key)
	}
	first := decodeQuiz[started](t, resp, http.StatusCreated)

	resp = c.post("/api/runs", map[string]any{"name": "keyed"})
	if again := playerCookie(t, resp); again.Value != key.Value {
		t.Fatalf("second start set key %q, want the first %q again", again.Value, key.Value)
	}
	second := decodeQuiz[started](t, resp, http.StatusCreated)
	if runPlayer(t, second.RunID) != runPlayer(t, first.RunID) {
		t.Fatal("a second start with the cookie made a new player")
	}

	api, err := url.Parse(srv.URL + "/api")
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	for _, bad := range []string{"nope", strings.Repeat("A", 43)} {
		c.http.Jar.SetCookies(api, []*http.Cookie{{Name: "wtf_player", Value: bad, Path: "/api",
			HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode}})
		resp = c.post("/api/runs", map[string]any{"name": "keyed"})
		if fresh := playerCookie(t, resp); fresh.Value == bad || fresh.Value == key.Value {
			t.Fatalf("start with key %q set %q, want a fresh key", bad, fresh.Value)
		}
		s := decodeQuiz[started](t, resp, http.StatusCreated)
		if runPlayer(t, s.RunID) == runPlayer(t, first.RunID) {
			t.Fatalf("start with key %q reused the first player", bad)
		}
	}

	resp = newClient(t, srv).post("/api/runs", map[string]any{"name": "   "})
	if cookies := resp.Header.Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("rejected start set cookies %v", cookies)
	}
	expectError(t, resp, http.StatusBadRequest, "invalid_name")
}

func TestOwnRowByPlayer(t *testing.T) {
	srv := newServer(t)
	me, other := newClient(t, srv), newClient(t, srv)
	play := func(c *client, body map[string]any) started {
		t.Helper()
		s := startRun(t, c, body)
		readState(t, c, s.RunID)
		answerWrong(t, c, s.RunID, 0)
		return s
	}
	mine := play(me, map[string]any{"name": "me"})
	theirs := play(other, map[string]any{"name": "other"})
	play(me, map[string]any{"name": "me", "quizId": theirs.QuizID})

	view := decodeQuiz[challenge](t, me.get("/api/quizzes/"+mine.QuizID), http.StatusOK)
	if view.Creator == nil || !view.Creator.Own || len(view.Top) != 1 || !view.Top[0].Own {
		t.Fatalf("own quiz = %+v, want an own creator and an own row", view)
	}
	view = decodeQuiz[challenge](t, me.get("/api/quizzes/"+theirs.QuizID), http.StatusOK)
	want := []entry{{Rank: 1, Name: "other"}, {Rank: 1, Name: "me", Own: true}}
	if view.Creator == nil || view.Creator.Own || len(view.Top) != 2 || view.Top[0] != want[0] || view.Top[1] != want[1] {
		t.Fatalf("other's quiz = %+v, want a foreign creator and rows %+v", view, want)
	}

	// The global list holds every run the database holds, so the own row may sit below its top 100.
	resp := me.get("/api/leaderboard")
	playerCookie(t, resp)
	var own []entry
	global := decodeQuiz[leaderboard](t, resp, http.StatusOK)
	for _, e := range global.Top {
		if e.Own {
			own = append(own, e)
		}
	}
	if len(own) > 1 || (len(global.Top) < 100 && (len(own) != 1 || own[0].Name != "me")) {
		t.Fatalf("own rows of the global list = %+v, want my one row", own)
	}

	resp = newClient(t, srv).get("/api/leaderboard")
	if cookies := resp.Header.Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("a read without a key set cookies %v", cookies)
	}
	for _, e := range decodeQuiz[leaderboard](t, resp, http.StatusOK).Top {
		if e.Own {
			t.Fatalf("a request without a key got an own row: %+v", e)
		}
	}
}

// playScore plays a run on body's quiz to score correct answers and a wrong one, and returns it.
func playScore(t *testing.T, c *client, body map[string]any, score int) started {
	t.Helper()
	s := startRun(t, c, body)
	for position := range score {
		readState(t, c, s.RunID)
		answerCorrectly(t, c, s.RunID, position)
	}
	readState(t, c, s.RunID)
	answerWrong(t, c, s.RunID, score)
	return s
}

func TestMe(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	resp := c.get("/api/me")
	if cookies := resp.Header.Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("/api/me without a key set cookies %v", cookies)
	}
	if got := decode[me](t, resp, http.StatusOK); got != (me{}) {
		t.Fatalf("/api/me without a key = %+v, want every field null", got)
	}

	created := playScore(t, c, map[string]any{"name": "me"}, 1)
	got := decodeGolden[me](t, "me", c.get("/api/me"), http.StatusOK, nil)
	if got.LastName == nil || *got.LastName != "me" || got.Best == nil || *got.Best != 1 ||
		got.WorldRank == nil || *got.WorldRank < 1 || got.WorldBest == nil || *got.WorldBest != 1 ||
		got.LastQuizID == nil || *got.LastQuizID != created.QuizID {
		t.Fatalf("/api/me after a creator run = %+v", got)
	}

	other := playScore(t, newClient(t, srv), map[string]any{"name": "other"}, 0)
	playScore(t, c, map[string]any{"name": "guest", "quizId": other.QuizID}, 2)
	got = decode[me](t, c.get("/api/me"), http.StatusOK)
	if got.LastName == nil || *got.LastName != "guest" || got.Best == nil || *got.Best != 2 ||
		got.WorldRank == nil || got.WorldBest == nil || *got.WorldBest != 1 ||
		got.LastQuizID == nil || *got.LastQuizID != other.QuizID {
		t.Fatalf("/api/me after a better challenge run = %+v, want its name, quiz and best 2, and world best 1", got)
	}
}

func TestBestPrevious(t *testing.T) {
	c := newClient(t, newServer(t))
	first := playScore(t, c, map[string]any{"name": "best"}, 1)
	if res := readState(t, c, first.RunID).Result; res == nil || res.Best != (best{Score: 1, IsNew: true}) {
		t.Fatalf("first result = %+v, want best 1, new, no previous", res)
	}
	second := playScore(t, c, map[string]any{"name": "best"}, 0)
	res := readState(t, c, second.RunID).Result
	if res == nil || res.Best.Score != 1 || res.Best.IsNew || res.Best.Previous == nil || *res.Best.Previous != 1 {
		t.Fatalf("lower second result = %+v, want best 1, not new, previous 1", res)
	}
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

func TestReadRateLimit(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	a := startRun(t, c, map[string]any{"name": "reader"})
	// Both routes share one bucket: a burst of 120, then one more read every 500 ms.
	paths := []string{"/api/leaderboard", "/api/quizzes/" + a.QuizID}
	for i := 0; ; i++ {
		resp := c.get(paths[i%2])
		if resp.StatusCode == http.StatusOK {
			_ = resp.Body.Close()
			if i >= 240 {
				t.Fatalf("%d reads allowed, want a refusal after the burst of 120", i+1)
			}
			continue
		}
		if i < 120 {
			t.Fatalf("read %d: status %d, want 200 within the burst", i+1, resp.StatusCode)
		}
		if retry, err := strconv.Atoi(resp.Header.Get("Retry-After")); err != nil || retry < 1 {
			t.Fatalf("Retry-After = %q, want whole seconds", resp.Header.Get("Retry-After"))
		}
		expectError(t, resp, http.StatusTooManyRequests, "rate_limited")
		break
	}
	decodeQuiz[leaderboard](t, newClient(t, srv).get(paths[0]), http.StatusOK)
}
