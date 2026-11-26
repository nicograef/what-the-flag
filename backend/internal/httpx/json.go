package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const maxBodyBytes = 1 << 20

// WriteJSON writes v as a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The status is sent; a failed write means the client went away.
	_ = json.NewEncoder(w).Encode(v)
}

// ReadJSON decodes the request body into dst. It caps the body at 1 MiB and
// rejects unknown fields and trailing data. A failure is an *Error.
func ReadJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	err := dec.Decode(dst)
	if err == nil {
		_, err = dec.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err == nil {
			err = errors.New("unexpected data after the JSON value")
		}
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return &Error{Status: http.StatusRequestEntityTooLarge, Code: "body_too_large", Message: "request body exceeds 1 MiB"}
	}
	return &Error{Status: http.StatusBadRequest, Code: "invalid_json", Message: err.Error()}
}
