package httpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadJSON(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{name: "valid", body: `{"name":"a"}`},
		{name: "over 1 MiB", body: `{"name":"` + strings.Repeat("a", 1<<20) + `"}`, status: 413, code: "body_too_large"},
		{name: "unknown field", body: `{"name":"a","extra":1}`, status: 400, code: "invalid_json"},
		{name: "trailing data", body: `{"name":"a"} {}`, status: 400, code: "invalid_json"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tt.body))
			var dst struct {
				Name string `json:"name"`
			}
			err := ReadJSON(httptest.NewRecorder(), r, &dst)
			if tt.code == "" {
				if err != nil || dst.Name != "a" {
					t.Fatalf("err = %v, name = %q", err, dst.Name)
				}
				return
			}
			var apiErr *Error
			if !errors.As(err, &apiErr) || apiErr.Status != tt.status || apiErr.Code != tt.code {
				t.Fatalf("err = %v, want %d %s", err, tt.status, tt.code)
			}
		})
	}
}

func TestWriteError(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{
			name:   "with field",
			err:    &Error{Status: 400, Code: "invalid_json", Message: "bad name", Field: "name"},
			status: 400,
			body:   `{"error":{"code":"invalid_json","message":"bad name","field":"name"}}` + "\n",
		},
		{
			name:   "without field",
			err:    fmt.Errorf("wrapped: %w", &Error{Status: 404, Code: "not_found", Message: "no route"}),
			status: 404,
			body:   `{"error":{"code":"not_found","message":"no route"}}` + "\n",
		},
		{
			name:   "plain error",
			err:    errors.New("boom"),
			status: 500,
			body:   `{"error":{"code":"internal","message":"internal server error"}}` + "\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			h := RequestID(slog.New(slog.NewJSONHandler(&logs, nil)))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				WriteError(w, r, tt.err)
			}))
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
			if rec.Code != tt.status || rec.Body.String() != tt.body {
				t.Fatalf("got %d %s, want %d %s", rec.Code, rec.Body, tt.status, tt.body)
			}
			if tt.status != 500 {
				return
			}
			var line struct {
				Msg       string `json:"msg"`
				RequestID string `json:"request_id"`
			}
			if err := json.Unmarshal(logs.Bytes(), &line); err != nil {
				t.Fatalf("log line %q: %v", logs.String(), err)
			}
			if line.RequestID == "" || line.RequestID != rec.Header().Get("X-Request-ID") {
				t.Fatalf("log request_id = %q, header = %q", line.RequestID, rec.Header().Get("X-Request-ID"))
			}
		})
	}
}

func TestMapError(t *testing.T) {
	errTaken := errors.New("name taken")
	errOther := errors.New("other")
	table := []ErrorCode{
		{Err: errTaken, Status: 409, Code: "name_taken", Field: "name"},
		{Err: errTaken, Status: 400, Code: "second"},
		{Err: errOther, Status: 422, Code: "other"},
	}
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{name: "first match wins", err: fmt.Errorf("create: %w", errTaken), status: 409, code: "name_taken"},
		{name: "no match", err: errors.New("unmapped"), status: 500, code: "internal"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			MapError(rec, httptest.NewRequest(http.MethodGet, "/", nil), tt.err, table)
			assertEnvelope(t, rec, tt.status, tt.code)
		})
	}
}

func TestRecover(t *testing.T) {
	h := Recover(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	assertEnvelope(t, rec, 500, "internal")
}

func TestRequestLog(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		status int
		logged bool
	}{
		{name: "healthy check", method: http.MethodGet, path: "/api/health", status: 200, logged: false},
		{name: "failed health check", method: http.MethodGet, path: "/api/health", status: 503, logged: true},
		{name: "other route", method: http.MethodGet, path: "/api/leaderboard", status: 200, logged: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			h := RequestID(slog.New(slog.NewJSONHandler(&logs, nil)))(RequestLog(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
			})))
			h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tt.method, tt.path, nil))
			if got := logs.Len() > 0; got != tt.logged {
				t.Fatalf("logged = %t, want %t: %s", got, tt.logged, logs.String())
			}
		})
	}
}

func TestRequireJSON(t *testing.T) {
	tests := []struct {
		contentType string
		status      int
	}{
		{contentType: "text/plain", status: 415},
		{contentType: "application/json; charset=utf-8", status: 200},
	}
	for _, tt := range tests {
		t.Run(tt.contentType, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
			r.Header.Set("Content-Type", tt.contentType)
			rec := httptest.NewRecorder()
			RequireJSON(okHandler).ServeHTTP(rec, r)
			if tt.status == 415 {
				assertEnvelope(t, rec, 415, "unsupported_media_type")
			} else if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
		})
	}
}

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name   string
		method string
		host   string
		origin string
		status int
	}{
		{name: "GET without Origin", method: http.MethodGet, host: "localhost:5173", status: 200},
		{name: "POST matching host and port", method: http.MethodPost, host: "localhost:5173", origin: "http://localhost:5173", status: 200},
		{name: "POST matching host case-insensitive", method: http.MethodPost, host: "What-The-Flag.de", origin: "https://what-the-flag.de", status: 200},
		{name: "POST other port", method: http.MethodPost, host: "localhost:5173", origin: "http://localhost:8080", status: 403},
		{name: "POST foreign host", method: http.MethodPost, host: "localhost:5173", origin: "http://evil.example:5173", status: 403},
		{name: "POST missing Origin", method: http.MethodPost, host: "localhost:5173", status: 403},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, "/", nil)
			r.Host = tt.host
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}
			rec := httptest.NewRecorder()
			CheckOrigin(okHandler).ServeHTTP(rec, r)
			if tt.status == 403 {
				assertEnvelope(t, rec, 403, "origin_mismatch")
			} else if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
		})
	}
}

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

func assertEnvelope(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("body %q: %v", rec.Body, err)
	}
	if rec.Code != status || env.Error.Code != code || env.Error.Message == "" {
		t.Fatalf("got %d %s, want %d %s", rec.Code, rec.Body, status, code)
	}
}
