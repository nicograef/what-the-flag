package postgres

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPingWithRetry(t *testing.T) {
	errDown := errors.New("down")
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	tests := []struct {
		name      string
		ctx       context.Context
		failures  int
		wantErr   error
		wantCalls int
		minCalls  int
	}{
		{name: "retry then success", ctx: context.Background(), failures: 2, wantCalls: 3},
		{name: "budget spent", ctx: context.Background(), failures: 1000, wantErr: context.DeadlineExceeded, minCalls: 2},
		{name: "ctx done", ctx: canceled, failures: 1000, wantErr: context.Canceled, wantCalls: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			ping := func(context.Context) error {
				calls++
				if calls <= tt.failures {
					return errDown
				}
				return nil
			}
			err := PingWithRetry(tt.ctx, ping, 100*time.Millisecond, time.Millisecond)
			if tt.wantErr == nil {
				if err != nil {
					t.Fatalf("err = %v", err)
				}
			} else if !errors.Is(err, tt.wantErr) || !errors.Is(err, errDown) {
				t.Fatalf("err = %v, want %v and %v", err, tt.wantErr, errDown)
			}
			if tt.wantCalls != 0 && calls != tt.wantCalls {
				t.Fatalf("calls = %d, want %d", calls, tt.wantCalls)
			}
			if calls < tt.minCalls {
				t.Fatalf("calls = %d, want at least %d", calls, tt.minCalls)
			}
		})
	}
}
