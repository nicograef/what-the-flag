package httpx

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type loggerKey struct{}

// Logger returns the request's logger, which carries request_id, or
// slog.Default outside a request.
func Logger(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}

// Chain wraps h in mw; the first middleware is the outermost.
func Chain(h http.Handler, mw ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mw) - 1; i >= 0; i-- {
		h = mw[i](h)
	}
	return h
}

// RequestID gives each request a fresh ID, sent as X-Request-ID and carried
// by the request's Logger.
func RequestID(base *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := rand.Text()
			w.Header().Set("X-Request-ID", id)
			ctx := context.WithValue(r.Context(), loggerKey{}, base.With("request_id", id))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(status int) {
	if s.status == 0 {
		s.status = status
	}
	s.ResponseWriter.WriteHeader(status)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// RequestLog logs one line per request with method, path, status and duration.
func RequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		Logger(r.Context()).Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// Recover turns a handler panic into a logged 500 internal.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			// ErrAbortHandler is net/http's signal to drop the connection silently.
			if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(v)
			}
			Logger(r.Context()).Error("panic", "panic", v)
			WriteError(w, r, &Error{Status: http.StatusInternalServerError, Code: "internal", Message: "internal server error"})
		}()
		next.ServeHTTP(w, r)
	})
}

func unsafeMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

// CheckOrigin rejects an unsafe request whose Origin host:port differs from
// Host. A missing or unparsable Origin counts as a mismatch.
func CheckOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if unsafeMethod(r.Method) {
			u, err := url.Parse(r.Header.Get("Origin"))
			if err != nil || u.Host == "" || !strings.EqualFold(u.Host, r.Host) {
				WriteError(w, r, &Error{Status: http.StatusForbidden, Code: "origin_mismatch", Message: "Origin does not match Host"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// RequireJSON rejects an unsafe request whose media type is not application/json.
func RequireJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if unsafeMethod(r.Method) {
			mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mt != "application/json" {
				WriteError(w, r, &Error{Status: http.StatusUnsupportedMediaType, Code: "unsupported_media_type", Message: "Content-Type must be application/json"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// NotFound answers 404 not_found; it serves the /api/ catch-all.
func NotFound(w http.ResponseWriter, r *http.Request) {
	WriteError(w, r, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "no route for " + r.Method + " " + r.URL.Path})
}
