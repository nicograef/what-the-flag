package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type failingPinger struct{}

func (failingPinger) Ping(context.Context) error { return errors.New("connection refused") }

func TestHandlerUnavailable(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(failingPinger{}).Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	want := `{"error":{"code":"database_unavailable","message":"database does not answer"}}` + "\n"
	if rec.Code != http.StatusServiceUnavailable || rec.Body.String() != want {
		t.Fatalf("got %d %s, want 503 %s", rec.Code, rec.Body, want)
	}
}
