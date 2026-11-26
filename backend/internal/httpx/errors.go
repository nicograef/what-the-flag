// Package httpx holds the HTTP plumbing every domain shares: the error envelope,
// JSON reading and writing, and the middleware chain.
package httpx

import (
	"errors"
	"net/http"
)

// Error is an API error, written as {"error": {"code", "message", "field"?}}.
// Message is a short English developer text, never shown to users.
type Error struct {
	Status  int
	Code    string
	Message string
	Field   string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

type envelope struct {
	Error envelopeError `json:"error"`
}

type envelopeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// WriteError writes an *Error as its envelope. Any other error is logged and
// answered with 500 internal.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		Logger(r.Context()).Error("request failed", "err", err)
		apiErr = &Error{Status: http.StatusInternalServerError, Code: "internal", Message: "internal server error"}
	}
	WriteJSON(w, apiErr.Status, envelope{Error: envelopeError{
		Code:    apiErr.Code,
		Message: apiErr.Message,
		Field:   apiErr.Field,
	}})
}

// ErrorCode maps a sentinel error to an API error.
type ErrorCode struct {
	Err    error
	Status int
	Code   string
	Field  string
}

// MapError writes the entry of table whose Err matches err (errors.Is); the
// first match wins. Without a match it falls back to WriteError.
func MapError(w http.ResponseWriter, r *http.Request, err error, table []ErrorCode) {
	for _, c := range table {
		if errors.Is(err, c.Err) {
			WriteError(w, r, &Error{Status: c.Status, Code: c.Code, Message: c.Err.Error(), Field: c.Field})
			return
		}
	}
	WriteError(w, r, err)
}
