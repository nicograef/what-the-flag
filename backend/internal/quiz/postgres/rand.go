package postgres

import (
	crand "crypto/rand"
	"math/rand/v2"
	"sync"
)

// Rand is the quiz core's random source, safe for concurrent requests.
type Rand struct {
	mu  sync.Mutex
	rnd *rand.Rand
}

// NewRand returns a ChaCha8 source seeded from crypto/rand.
func NewRand() *Rand {
	var seed [32]byte
	_, _ = crand.Read(seed[:]) // crypto/rand.Read never returns an error.
	//nolint:gosec // G404: ChaCha8 seeded from crypto/rand; no secret depends on question draws.
	return &Rand{rnd: rand.New(rand.NewChaCha8(seed))}
}

// IntN returns a uniform int in [0, n).
func (r *Rand) IntN(n int) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.rnd.IntN(n)
}

// Shuffle permutes n elements through swap, which must not call r.
func (r *Rand) Shuffle(n int, swap func(i, j int)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rnd.Shuffle(n, swap)
}
