package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/nicograef/what-the-flag/internal/quiz"
)

// Players stores anonymous players by the SHA-256 of their key; *postgres.Players meets it.
type Players interface {
	// Resolve returns the player whose key hashes to hash; ok is false for an unknown hash.
	Resolve(ctx context.Context, hash []byte) (id quiz.PlayerID, ok bool, err error)
	Create(ctx context.Context, hash []byte) (quiz.PlayerID, error)
}

const (
	playerCookie = "wtf_player"
	keyBytes     = 32
	// playerMaxAge is 400 days in seconds, Chrome's cap on a cookie's lifetime.
	playerMaxAge = 400 * 24 * 60 * 60
)

var keyEncoding = base64.RawURLEncoding.Strict()

// playerKey reads the key from the player cookie; ok is false when the cookie is missing or holds anything
// but 43 base64url characters.
func playerKey(r *http.Request) (key []byte, ok bool) {
	c, err := r.Cookie(playerCookie)
	if err != nil || len(c.Value) != keyEncoding.EncodedLen(keyBytes) {
		return nil, false
	}
	key, err = keyEncoding.DecodeString(c.Value)
	return key, err == nil && len(key) == keyBytes
}

func keyHash(key []byte) []byte {
	h := sha256.Sum256(key)
	return h[:]
}

// setPlayerCookie (re-)sets the player cookie, which restarts its lifetime. HttpOnly keeps the key out of
// script-writable storage, which Safari deletes after 7 days without interaction (D14).
func setPlayerCookie(w http.ResponseWriter, key []byte) {
	http.SetCookie(w, &http.Cookie{
		Name:     playerCookie,
		Value:    keyEncoding.EncodeToString(key),
		Path:     "/api",
		MaxAge:   playerMaxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// player returns the requester's player, nil for a missing, malformed or unknown key, and re-sets a known
// key's cookie.
func (h *Handler) player(ctx context.Context, w http.ResponseWriter, r *http.Request) (*quiz.PlayerID, error) {
	key, ok := playerKey(r)
	if !ok {
		return nil, nil
	}
	id, ok, err := h.players.Resolve(ctx, keyHash(key))
	if err != nil {
		return nil, fmt.Errorf("resolve player: %w", err)
	}
	if !ok {
		return nil, nil
	}
	setPlayerCookie(w, key)
	return &id, nil
}

// startPlayer returns the PlayerFunc of a run start: the requester's player, or a fresh one under a fresh key.
func (h *Handler) startPlayer(w http.ResponseWriter, r *http.Request) quiz.PlayerFunc {
	return func(ctx context.Context) (quiz.PlayerID, error) {
		known, err := h.player(ctx, w, r)
		if err != nil {
			return quiz.PlayerID{}, err
		}
		if known != nil {
			return *known, nil
		}
		key := make([]byte, keyBytes)
		_, _ = rand.Read(key) // crypto/rand.Read never returns an error.
		id, err := h.players.Create(ctx, keyHash(key))
		if err != nil {
			return quiz.PlayerID{}, fmt.Errorf("create player: %w", err)
		}
		setPlayerCookie(w, key)
		return id, nil
	}
}
