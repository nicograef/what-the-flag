//go:build integration

package contract

import (
	"net/http"
	"testing"
)

func TestHealth(t *testing.T) {
	c := newClient(t, newServer(t))
	got := decode[struct {
		Status string `json:"status"`
	}](t, c.get("/api/health"), http.StatusOK)
	if got.Status != "ok" {
		t.Fatalf("status = %q, want ok", got.Status)
	}
}

func TestUnknownRoute(t *testing.T) {
	c := newClient(t, newServer(t))
	expectError(t, c.get("/api/nope"), http.StatusNotFound, "not_found")
}
