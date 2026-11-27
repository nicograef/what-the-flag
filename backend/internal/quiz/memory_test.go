package quiz

import (
	"cmp"
	"context"
	"slices"
	"time"

	"github.com/google/uuid"
)

// memory is an in-memory Repository and Leaderboards for the core's tests: no lock, no rollback.
type memory struct {
	quizzes   map[QuizID]time.Time
	questions map[QuizID]map[int]Question
	runs      map[RunID]*Run
}

func newMemory() *memory {
	return &memory{
		quizzes:   map[QuizID]time.Time{},
		questions: map[QuizID]map[int]Question{},
		runs:      map[RunID]*Run{},
	}
}

func cloneRun(r *Run) *Run {
	c := *r
	c.Answers = slices.Clone(r.Answers)
	return &c
}

func (m *memory) CreateQuiz(_ context.Context, now time.Time) (QuizID, error) {
	id := QuizID(uuid.New())
	m.quizzes[id] = now
	m.questions[id] = map[int]Question{}
	return id, nil
}

func (m *memory) CreateRun(_ context.Context, r Run) error {
	m.runs[r.ID] = cloneRun(&r)
	return nil
}

func (m *memory) QuizExists(_ context.Context, id QuizID) (bool, error) {
	_, ok := m.quizzes[id]
	return ok, nil
}

func (m *memory) InRun(_ context.Context, id RunID, fn func(UnitOfWork) error) error {
	r, ok := m.runs[id]
	if !ok {
		return ErrRunNotFound
	}
	return fn(&memoryUnit{m: m, run: cloneRun(r)})
}

type memoryUnit struct {
	m   *memory
	run *Run
}

func (u *memoryUnit) Run() *Run { return u.run }

func (u *memoryUnit) Question(position int) (Question, bool, error) {
	q, ok := u.m.questions[u.run.QuizID][position]
	return q, ok, nil
}

func (u *memoryUnit) AddQuestion(position int, q Question) (Question, error) {
	stored, ok := u.m.questions[u.run.QuizID][position]
	if ok {
		return stored, nil
	}
	u.m.questions[u.run.QuizID][position] = q
	return q, nil
}

func (u *memoryUnit) Targets() (map[string]bool, error) {
	used := map[string]bool{}
	for _, q := range u.m.questions[u.run.QuizID] {
		used[q.Target] = true
	}
	return used, nil
}

func (u *memoryUnit) SaveRun(r *Run) error {
	u.m.runs[r.ID] = cloneRun(r)
	return nil
}

// ended returns when r ended as of now, counting a late open answer as ended at its deadline plus grace.
func ended(r *Run, now time.Time) (time.Time, bool) {
	if r.FinishedAt != nil {
		return *r.FinishedAt, true
	}
	if a := r.open(); a != nil {
		if end := a.ServedAt.Add(Limit + Grace); end.Before(now) {
			return end, true
		}
	}
	return time.Time{}, false
}

// ranking returns the visible ended runs that keep, best first, with their ranks.
func (m *memory) ranking(now time.Time, keep func(*Run) bool) ([]*Run, []int) {
	type row struct {
		run *Run
		end time.Time
	}
	var rows []row
	for _, r := range m.runs {
		if end, ok := ended(r, now); ok && !r.Hidden && keep(r) {
			rows = append(rows, row{r, end})
		}
	}
	slices.SortFunc(rows, func(a, b row) int {
		return cmp.Or(cmp.Compare(b.run.Score, a.run.Score), a.end.Compare(b.end),
			slices.Compare(a.run.ID[:], b.run.ID[:]))
	})
	runs, ranks := make([]*Run, len(rows)), make([]int, len(rows))
	for i, rw := range rows {
		runs[i], ranks[i] = rw.run, i+1
		if i > 0 && rw.run.Score == rows[i-1].run.Score {
			ranks[i] = ranks[i-1]
		}
	}
	return runs, ranks
}

func (m *memory) entries(now time.Time, own *RunID, keep func(*Run) bool) []Entry {
	runs, ranks := m.ranking(now, keep)
	entries := []Entry{}
	for i, r := range runs[:min(100, len(runs))] {
		entries = append(entries, Entry{Rank: ranks[i], Name: r.Name, Score: r.Score, Own: own != nil && *own == r.ID})
	}
	return entries
}

func (m *memory) Global(_ context.Context, now time.Time, own *RunID) ([]Entry, error) {
	return m.entries(now, own, func(r *Run) bool { return r.Creator }), nil
}

func (m *memory) Quiz(_ context.Context, id QuizID, now time.Time, own *RunID) ([]Entry, error) {
	return m.entries(now, own, func(r *Run) bool { return r.QuizID == id }), nil
}

func (m *memory) Creator(_ context.Context, id QuizID, now time.Time) (CreatorView, error) {
	for _, r := range m.runs {
		if r.QuizID == id && r.Creator {
			_, ok := ended(r, now)
			return CreatorView{Name: r.Name, Score: r.Score, Ended: ok}, nil
		}
	}
	return CreatorView{}, ErrQuizNotFound
}

func (m *memory) Ranks(_ context.Context, id RunID, now time.Time) (Ranks, error) {
	r, ok := m.runs[id]
	if !ok {
		return Ranks{}, ErrRunNotFound
	}
	// A run's rank is one more than the visible ended runs of its list with a higher score.
	rankIn := func(keep func(*Run) bool) int {
		runs, _ := m.ranking(now, keep)
		return 1 + len(slices.DeleteFunc(runs, func(o *Run) bool { return o.Score <= r.Score }))
	}
	ranks := Ranks{Quiz: rankIn(func(o *Run) bool { return o.QuizID == r.QuizID })}
	if r.Creator {
		ranks.Global = new(rankIn(func(o *Run) bool { return o.Creator }))
	}
	return ranks, nil
}
