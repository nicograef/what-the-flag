package ratelimit

import (
	"net/http/httptest"
	"testing"
	"time"
)

type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func TestAllow(t *testing.T) {
	c := &clock{now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	l := New(3, 5*time.Second, c.Now)

	for i := range 3 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d of the burst refused", i+1)
		}
	}
	if ok, wait := l.Allow("a"); ok || wait != 5*time.Second {
		t.Fatalf("after the burst = %t, %v; want false, 5s", ok, wait)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("another key refused")
	}

	c.now = c.now.Add(2 * time.Second)
	if ok, wait := l.Allow("a"); ok || wait != 3*time.Second {
		t.Fatalf("2 s later = %t, %v; want false, 3s", ok, wait)
	}
	c.now = c.now.Add(3 * time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("refill after 5 s refused")
	}
	if ok, _ := l.Allow("a"); ok {
		t.Fatal("one refill allowed two requests")
	}

	// A minute later both buckets are full again, so the next call prunes them.
	c.now = c.now.Add(time.Minute)
	if ok, _ := l.Allow("c"); !ok {
		t.Fatal("fresh key refused")
	}
	if _, ok := l.full["a"]; ok || len(l.full) != 1 {
		t.Fatalf("buckets after pruning = %v, want only c", l.full)
	}
}

func TestClientKey(t *testing.T) {
	tests := []struct {
		name       string
		xff        []string
		remoteAddr string
		want       string
	}{
		{"forwarded IPv4, last hop wins", []string{"203.0.113.9, 198.51.100.7"}, "172.18.0.5:41000", "198.51.100.7"},
		{"forwarded in two header lines", []string{"203.0.113.9", "198.51.100.7"}, "172.18.0.5:41000", "198.51.100.7"},
		{"forwarded IPv6 per /64", []string{"2001:db8:1:2:aaaa:bbbb:cccc:dddd"}, "172.18.0.5:41000", "2001:db8:1:2::/64"},
		{"IPv4-mapped IPv6", []string{"::ffff:198.51.100.7"}, "172.18.0.5:41000", "198.51.100.7"},
		{"RemoteAddr IPv4", nil, "198.51.100.7:52000", "198.51.100.7"},
		{"RemoteAddr IPv6", nil, "[2001:db8:1:2::1]:52000", "2001:db8:1:2::/64"},
		{"unparsable forward falls back", []string{"unknown"}, "198.51.100.7:52000", "198.51.100.7"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/runs", nil)
			r.RemoteAddr = tt.remoteAddr
			for _, v := range tt.xff {
				r.Header.Add("X-Forwarded-For", v)
			}
			if got := ClientKey(r); got != tt.want {
				t.Fatalf("ClientKey = %q, want %q", got, tt.want)
			}
		})
	}
}
