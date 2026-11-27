// Package ratelimit holds token buckets per client key, in process memory only.
package ratelimit

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

const (
	// pruneEvery is the least time between two sweeps of full buckets.
	pruneEvery = time.Minute
	// maxKeys caps the stored buckets; beyond it a new key waits for a sweep.
	maxKeys = 100_000
	// fullWait is the wait a new key gets while the cap holds.
	fullWait = time.Second
)

// Limiter is a token bucket per key: burst tokens, one more every interval.
// A bucket is stored as the time it is full again (GCRA), so a full bucket is one in the past.
type Limiter struct {
	burst   int
	every   time.Duration
	now     func() time.Time
	maxKeys int
	mu      sync.Mutex
	full    map[string]time.Time
	pruned  time.Time
}

// New returns a Limiter allowing burst requests per key and one more every interval.
func New(burst int, every time.Duration, now func() time.Time) *Limiter {
	return &Limiter{burst: burst, every: every, now: now, maxKeys: maxKeys, full: map[string]time.Time{}, pruned: now()}
}

// Allow takes a token from key's bucket. Without one it returns false and the wait until the next token.
func (l *Limiter) Allow(key string) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.pruned) >= pruneEvery {
		for k, full := range l.full {
			if !full.After(now) {
				delete(l.full, k)
			}
		}
		l.pruned = now
	}
	full, stored := l.full[key]
	if !stored && len(l.full) >= l.maxKeys {
		return false, fullWait
	}
	if full.Before(now) {
		full = now
	}
	// The bucket holds burst - ceil(debt/every) tokens; a request needs the debt to stay under burst tokens.
	if wait := full.Sub(now) - time.Duration(l.burst-1)*l.every; wait > 0 {
		return false, wait
	}
	l.full[key] = full.Add(l.every)
	return true, 0
}

// Refund returns the token Allow took from key's bucket.
func (l *Limiter) Refund(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	full, ok := l.full[key]
	if !ok {
		return
	}
	if full = full.Add(-l.every); full.After(l.now()) {
		l.full[key] = full
	} else {
		delete(l.full, key)
	}
}

// Step is one bucket a request draws from: a Limiter and the request's key in it.
type Step struct {
	Limiter *Limiter
	Key     string
}

// AllowAll takes a token from every step in order. On a refusal it refunds the tokens already taken,
// so a request refused by one bucket costs no other.
func AllowAll(steps ...Step) (ok bool, retryAfter time.Duration) {
	for i, s := range steps {
		if ok, wait := s.Limiter.Allow(s.Key); !ok {
			for _, taken := range steps[:i] {
				taken.Limiter.Refund(taken.Key)
			}
			return false, wait
		}
	}
	return true, 0
}

// ClientKeys identifies the client of r: the last X-Forwarded-For entry, which the edge sets from the
// client connection, else the host of RemoteAddr. An IPv6 address counts per /64 network as client
// and per /48 as network; an IPv4 address has no network key.
func ClientKeys(r *http.Request) (client, network string) {
	addr := ""
	if xff := r.Header.Values("X-Forwarded-For"); len(xff) > 0 {
		last := xff[len(xff)-1]
		addr = strings.TrimSpace(last[strings.LastIndexByte(last, ',')+1:])
	}
	ip, err := netip.ParseAddr(addr)
	if err != nil {
		host, _, splitErr := net.SplitHostPort(r.RemoteAddr)
		if splitErr != nil {
			host = r.RemoteAddr
		}
		if ip, err = netip.ParseAddr(host); err != nil {
			return host, ""
		}
	}
	ip = ip.Unmap().WithZone("")
	if ip.Is6() {
		return netip.PrefixFrom(ip, 64).Masked().String(), netip.PrefixFrom(ip, 48).Masked().String()
	}
	return ip.String(), ""
}
