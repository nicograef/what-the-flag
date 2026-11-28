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

func (u *memoryUnit) Questions() ([]Question, error) {
	var stored []Question
	for p := 0; ; p++ {
		q, ok := u.m.questions[u.run.QuizID][p]
		if !ok {
			return stored, nil
		}
		stored = append(stored, q)
	}
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

func (m *memory) Global(context.Context, time.Time, *PlayerID) ([]Entry, error) {
	return nil, errNoLists
}

func (m *memory) Quiz(context.Context, QuizID, time.Time, *PlayerID) ([]Entry, error) {
	return nil, errNoLists
}

func (m *memory) Creator(_ context.Context, id QuizID, now time.Time, own *PlayerID) (*CreatorView, error) {
	for _, r := range m.runs {
		if r.QuizID == id && r.Creator {
			return &CreatorView{Name: r.Name, Score: r.Score, Ended: ended(r, now), Own: own != nil && *own == r.Player}, nil
		}
	}
	return nil, ErrQuizNotFound
}

func (m *memory) Ranks(context.Context, RunID, time.Time) (Ranks, error) { return Ranks{}, nil }

func (m *memory) Best(context.Context, RunID, time.Time) (Best, error) { return Best{}, nil }

func (m *memory) Player(context.Context, PlayerID, time.Time) (PlayerSummary, error) {
	return PlayerSummary{}, errNoLists
}
