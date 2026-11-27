//go:build integration

package postgres

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/nicograef/what-the-flag/internal/postgres"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// Leaderboard tests store runs at scores from 10000 in a rolled-back transaction,
// so the runs other tests commit, all far below, never rank among them.
const base = 10000

// board stores runs for one test inside its transaction.
type board struct {
	t   *testing.T
	tx  pgx.Tx
	now time.Time
}

func newBoard(t *testing.T) *board {
	return &board{t: t, tx: postgres.TestTx(t), now: time.Now().Truncate(time.Microsecond)}
}

// spec is a stored run. A zero end leaves it unfinished; open, when set, is the age of its open answer.
type spec struct {
	name    string
	score   int
	creator bool
	end     time.Duration // finished this long before now
	open    time.Duration // served this long before now, unanswered
	hidden  bool
}

func (b *board) quiz() quiz.QuizID {
	b.t.Helper()
	var id uuid.UUID
	if err := b.tx.QueryRow(context.Background(),
		`INSERT INTO quizzes (created_at) VALUES ($1) RETURNING id`, b.now).Scan(&id); err != nil {
		b.t.Fatalf("insert quiz: %v", err)
	}
	return quiz.QuizID(id)
}

func (b *board) run(q quiz.QuizID, s spec) quiz.RunID {
	b.t.Helper()
	ctx := context.Background()
	id := uuid.New()
	var finished *time.Time
	var reason *string
	if s.end > 0 {
		finished, reason = new(b.now.Add(-s.end)), new("wrong")
	}
	_, err := b.tx.Exec(ctx, `
		INSERT INTO runs (id, quiz_id, name, creator, started_at, score, finished_at, end_reason, hidden)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, uuid.UUID(q), s.name, s.creator, b.now.Add(-time.Hour), s.score, finished, reason, s.hidden)
	if err != nil {
		b.t.Fatalf("insert run %s: %v", s.name, err)
	}
	if s.open > 0 {
		if _, err := b.tx.Exec(ctx, `INSERT INTO run_answers (run_id, position, served_at) VALUES ($1, $2, $3)`,
			id, s.score, b.now.Add(-s.open)); err != nil {
			b.t.Fatalf("insert open answer of %s: %v", s.name, err)
		}
	}
	return quiz.RunID(id)
}

// creator stores s as the creator of a fresh quiz.
func (b *board) creator(s spec) (quiz.QuizID, quiz.RunID) {
	s.creator = true
	q := b.quiz()
	return q, b.run(q, s)
}

// global returns the global list's rows of this test's runs, which rank above every other.
func (b *board) global(l *Leaderboards, own *quiz.RunID) []quiz.Entry {
	b.t.Helper()
	entries, err := l.Global(context.Background(), b.now, own)
	if err != nil {
		b.t.Fatalf("global list: %v", err)
	}
	var kept []quiz.Entry
	for _, e := range entries {
		if e.Score >= base {
			kept = append(kept, e)
		}
	}
	return kept
}

func TestLeaderboard(t *testing.T) {
	ctx := context.Background()

	t.Run("equal scores share a rank and ties order by earlier end", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		b.creator(spec{name: "later", score: base + 2, end: time.Minute})
		b.creator(spec{name: "earlier", score: base + 2, end: 2 * time.Minute})
		q, third := b.creator(spec{name: "third", score: base + 1, end: 3 * time.Minute})

		want := []quiz.Entry{
			{Rank: 1, Name: "earlier", Score: base + 2},
			{Rank: 1, Name: "later", Score: base + 2},
			{Rank: 3, Name: "third", Score: base + 1},
		}
		if got := b.global(l, nil); !reflect.DeepEqual(got, want) {
			t.Fatalf("global = %+v, want %+v", got, want)
		}
		ranks, err := l.Ranks(ctx, third, b.now)
		if err != nil || ranks.Quiz != 1 || ranks.Global == nil || *ranks.Global != 3 {
			t.Fatalf("ranks of third = %+v, %v; want quiz 1, global 3", ranks, err)
		}
		if top, err := l.Quiz(ctx, q, b.now, nil); err != nil || len(top) != 1 || top[0].Name != "third" {
			t.Fatalf("quiz list = %+v, %v; want only third", top, err)
		}
	})

	t.Run("the 101st row is cut", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		q, _ := b.creator(spec{name: "run 0", score: base, end: time.Minute})
		for i := 1; i <= 100; i++ {
			b.creator(spec{name: fmt.Sprintf("run %d", i), score: base + i, end: time.Minute})
			b.run(q, spec{name: fmt.Sprintf("guest %d", i), score: base + i, end: time.Minute})
		}
		global := b.global(l, nil)
		if len(global) != 100 || global[0].Score != base+100 || global[99].Score != base+1 {
			t.Fatalf("global holds %d rows from %d to %d, want 100 from %d to %d",
				len(global), global[0].Score, global[len(global)-1].Score, base+100, base+1)
		}
		top, err := l.Quiz(ctx, q, b.now, nil)
		if err != nil || len(top) != 100 || top[99].Name != "guest 1" {
			t.Fatalf("quiz list holds %d rows, %v; want 100 ending with guest 1", len(top), err)
		}
	})

	t.Run("a hidden and an unended run are absent", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		q, _ := b.creator(spec{name: "shown", score: base, end: time.Minute})
		b.run(q, spec{name: "hidden", score: base + 3, end: time.Minute, hidden: true})
		b.run(q, spec{name: "fresh answer", score: base + 2, open: 16 * time.Second})
		b.run(q, spec{name: "no answer", score: base + 1})
		want := []quiz.Entry{{Rank: 1, Name: "shown", Score: base}}
		if got := b.global(l, nil); !reflect.DeepEqual(got, want) {
			t.Fatalf("global = %+v, want %+v", got, want)
		}
		if got, err := l.Quiz(ctx, q, b.now, nil); err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("quiz list = %+v, %v; want %+v", got, err, want)
		}
		playing, _ := b.creator(spec{name: "playing", score: base, open: 16 * time.Second})
		if v, err := l.Creator(ctx, playing, b.now); err != nil || v == nil || *v != (quiz.CreatorView{Name: "playing", Score: base}) {
			t.Fatalf("creator view = %+v, %v; want not ended", v, err)
		}
		hidden, _ := b.creator(spec{name: "hidden creator", score: base, end: time.Minute, hidden: true})
		if v, err := l.Creator(ctx, hidden, b.now); err != nil || v != nil {
			t.Fatalf("hidden creator view = %+v, %v; want nil", v, err)
		}
	})

	t.Run("a non-creator is absent from the global list", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		q, _ := b.creator(spec{name: "creator", score: base, end: time.Minute})
		guest := b.run(q, spec{name: "guest", score: base + 9, end: time.Minute})
		if got := b.global(l, nil); len(got) != 1 || got[0].Name != "creator" {
			t.Fatalf("global = %+v, want only creator", got)
		}
		want := []quiz.Entry{{Rank: 1, Name: "guest", Score: base + 9}, {Rank: 2, Name: "creator", Score: base}}
		if got, err := l.Quiz(ctx, q, b.now, nil); err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("quiz list = %+v, %v; want %+v", got, err, want)
		}
		if ranks, err := l.Ranks(ctx, guest, b.now); err != nil || ranks != (quiz.Ranks{Quiz: 1}) {
			t.Fatalf("ranks of guest = %+v, %v; want quiz 1 and no global rank", ranks, err)
		}
	})

	t.Run("an open answer older than 17 s counts as ended at served_at + 17 s", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		b.creator(spec{name: "ended 500 ms ago", score: base, end: 500 * time.Millisecond})
		q, _ := b.creator(spec{name: "expired 1 s ago", score: base, open: 18 * time.Second})
		b.creator(spec{name: "ended 2 s ago", score: base, end: 2 * time.Second})
		want := []quiz.Entry{
			{Rank: 1, Name: "ended 2 s ago", Score: base},
			{Rank: 1, Name: "expired 1 s ago", Score: base},
			{Rank: 1, Name: "ended 500 ms ago", Score: base},
		}
		if got := b.global(l, nil); !reflect.DeepEqual(got, want) {
			t.Fatalf("global = %+v, want %+v", got, want)
		}
		if v, err := l.Creator(ctx, q, b.now); err != nil || v == nil || !v.Ended {
			t.Fatalf("creator view = %+v, %v; want ended", v, err)
		}
	})

	t.Run("own marks only the requester's row", func(t *testing.T) {
		b := newBoard(t)
		l := NewLeaderboards(b.tx)
		q, _ := b.creator(spec{name: "creator", score: base + 1, end: time.Minute})
		own := b.run(q, spec{name: "me", score: base, end: time.Minute})
		b.run(q, spec{name: "me", score: base, end: 2 * time.Minute})
		want := []quiz.Entry{
			{Rank: 1, Name: "creator", Score: base + 1},
			{Rank: 2, Name: "me", Score: base},
			{Rank: 2, Name: "me", Score: base, Own: true},
		}
		if got, err := l.Quiz(ctx, q, b.now, &own); err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("quiz list = %+v, %v; want %+v", got, err, want)
		}
		if got := b.global(l, &own); len(got) != 1 || got[0].Own {
			t.Fatalf("global = %+v, want the creator without own", got)
		}
	})
}
