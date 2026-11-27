//go:build integration

// Package contract tests the API on the real handler chain and database.
package contract

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/nicograef/what-the-flag/internal/app"
	"github.com/nicograef/what-the-flag/internal/postgres"
)

// newServer serves app.New on the test database.
func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(app.New(app.Deps{
		Pool: postgres.TestPool(t),
		Log:  slog.New(slog.NewTextHandler(t.Output(), nil)),
	}))
	t.Cleanup(srv.Close)
	return srv
}

// client is one browser behind the edge: its own /64 in 2001:db8::/32, sent as X-Forwarded-For.
type client struct {
	t    *testing.T
	http *http.Client
	base string
	ip   string
}

func newClient(t *testing.T, srv *httptest.Server) *client {
	t.Helper()
	ip := make(net.IP, net.IPv6len)
	copy(ip, net.ParseIP("2001:db8::"))
	_, _ = rand.Read(ip[4:8])
	ip[15] = 1
	return &client{t: t, http: srv.Client(), base: srv.URL, ip: ip.String()}
}

// do sends a request. Unsafe methods carry Origin, Content-Type and a JSON
// body ({} when body is nil), as the frontend's client does.
func (c *client) do(method, path string, body any) *http.Response {
	c.t.Helper()
	var reader io.Reader
	unsafe := method != http.MethodGet && method != http.MethodHead
	if unsafe {
		if body == nil {
			body = struct{}{}
		}
		b, err := json.Marshal(body)
		if err != nil {
			c.t.Fatalf("marshal body: %v", err)
		}
		reader = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		c.t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Forwarded-For", c.ip)
	if unsafe {
		req.Header.Set("Origin", c.base)
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	return resp
}

func (c *client) get(path string) *http.Response { return c.do(http.MethodGet, path, nil) }

func (c *client) post(path string, body any) *http.Response {
	return c.do(http.MethodPost, path, body)
}

// decode checks the status and decodes the body strictly, which pins the wire shape.
func decode[T any](t *testing.T, resp *http.Response, status int) T {
	t.Helper()
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if resp.StatusCode != status {
		t.Fatalf("status = %d, want %d; body %s", resp.StatusCode, status, body)
	}
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.DisallowUnknownFields()
	var v T
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		t.Fatalf("trailing data in %s", body)
	}
	return v
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// expectError checks the status and the error envelope's code and returns the error.
func expectError(t *testing.T, resp *http.Response, status int, code string) apiError {
	t.Helper()
	env := decode[struct {
		Error apiError `json:"error"`
	}](t, resp, status)
	if env.Error.Code != code || env.Error.Message == "" {
		t.Fatalf("error = %+v, want code %q and a message", env.Error, code)
	}
	return env.Error
}
