package quiz

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"
)

// memory is an in-memory Repository and Leaderboards for the core's tests: no lock, no rollback, no hidden runs.
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

func (m *memory) CreateQuizWithRun(_ context.Context, r Run) (QuizID, error) {
	r.QuizID = QuizID(uuid.New())
	m.quizzes[r.QuizID] = r.StartedAt
	m.questions[r.QuizID] = map[int]Question{}
	m.runs[r.ID] = cloneRun(&r)
	return r.QuizID, nil
}

func (m *memory) CreateRun(_ context.Context, r Run) error {
	m.runs[r.ID] = cloneRun(&r)
	return nil
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

func (u *memoryUnit) AddQuestion(position int, q Question) error {
	if _, ok := u.m.questions[u.run.QuizID][position]; !ok {
		u.m.questions[u.run.QuizID][position] = q
	}
	return nil
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

// ended reports whether r has ended as of now, counting a late open answer as ended.
func ended(r *Run, now time.Time) bool {
	if r.FinishedAt != nil {
		return true
	}
	a := r.open()
	return a != nil && a.ServedAt.Add(Limit+Grace).Before(now)
}

// errNoLists marks the leaderboard lists, which the postgres integration tests own, as outside the core's tests.
var errNoLists = errors.New("memory: no leaderboard lists")

func (m *memory) Global(context.Context, time.Time, *RunID) ([]Entry, error) { return nil, errNoLists }

func (m *memory) Quiz(context.Context, QuizID, time.Time, *RunID) ([]Entry, error) {
	return nil, errNoLists
}

func (m *memory) Creator(_ context.Context, id QuizID, now time.Time) (*CreatorView, error) {
	for _, r := range m.runs {
		if r.QuizID == id && r.Creator {
			return &CreatorView{Name: r.Name, Score: r.Score, Ended: ended(r, now)}, nil
		}
	}
	return nil, ErrQuizNotFound
}

func (m *memory) Ranks(context.Context, RunID, time.Time) (Ranks, error) { return Ranks{}, nil }
