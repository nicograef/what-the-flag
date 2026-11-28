// Package postgres implements the quiz core's Repository on PostgreSQL.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/nicograef/what-the-flag/internal/quiz"
	"github.com/nicograef/what-the-flag/internal/quiz/postgres/internal/db"
)

// DB is a pool or a transaction: sqlc's DBTX plus Begin.
type DB interface {
	db.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Repository stores quizzes, their questions and runs.
type Repository struct {
	db DB
}

var _ quiz.Repository = (*Repository)(nil)

// NewRepository returns a Repository on d.
func NewRepository(d DB) *Repository {
	return &Repository{db: d}
}

// CreateQuizWithRun stores a fresh quiz created at run.StartedAt and run as its creator run, in one transaction.
func (r *Repository) CreateQuizWithRun(ctx context.Context, run quiz.Run) (quiz.QuizID, error) {
	err := r.inTx(ctx, func(q *db.Queries) error {
		id, err := q.CreateQuiz(ctx, run.StartedAt)
		if err != nil {
			return fmt.Errorf("create quiz: %w", err)
		}
		run.QuizID = quiz.QuizID(id)
		return createRun(ctx, q, run)
	})
	if err != nil {
		return quiz.QuizID{}, err
	}
	return run.QuizID, nil
}

// CreateRun stores a fresh run on an existing quiz.
func (r *Repository) CreateRun(ctx context.Context, run quiz.Run) error {
	return createRun(ctx, db.New(r.db), run)
}

// createRun stores a fresh run; a fresh run has no score, answers or end.
func createRun(ctx context.Context, q *db.Queries, run quiz.Run) error {
	return q.CreateRun(ctx, db.CreateRunParams{
		ID:        uuid.UUID(run.ID),
		QuizID:    uuid.UUID(run.QuizID),
		PlayerID:  uuid.UUID(run.Player),
		Name:      run.Name,
		Creator:   run.Creator,
		StartedAt: run.StartedAt,
	})
}

// InRun calls fn in one transaction with the run row locked FOR UPDATE; fn's error rolls it back.
func (r *Repository) InRun(ctx context.Context, id quiz.RunID, fn func(quiz.UnitOfWork) error) error {
	return r.inTx(ctx, func(q *db.Queries) error {
		run, err := loadRun(ctx, q, id)
		if err != nil {
			return err
		}
		u := &unit{ctx: ctx, q: q, run: run, saved: map[int]quiz.Answer{}}
		for _, a := range run.Answers {
			u.saved[a.Position] = a
		}
		return fn(u)
	})
}

// inTx calls fn in one transaction, which fn's error rolls back.
func (r *Repository) inTx(ctx context.Context, fn func(*db.Queries) error) (err error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() {
		if err != nil {
			// The rollback error adds nothing to err, which already explains the failure.
			_ = tx.Rollback(ctx)
		}
	}()
	if err := fn(db.New(tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func loadRun(ctx context.Context, q *db.Queries, id quiz.RunID) (*quiz.Run, error) {
	row, err := q.LockRun(ctx, uuid.UUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, quiz.ErrRunNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lock run: %w", err)
	}
	answers, err := q.ListRunAnswers(ctx, row.ID)
	if err != nil {
		return nil, fmt.Errorf("list answers: %w", err)
	}
	run := &quiz.Run{
		ID:         quiz.RunID(row.ID),
		QuizID:     quiz.QuizID(row.QuizID),
		Player:     quiz.PlayerID(row.PlayerID),
		Name:       row.Name,
		Creator:    row.Creator,
		Score:      int(row.Score),
		StartedAt:  row.StartedAt,
		FinishedAt: row.FinishedAt,
		Answers:    make([]quiz.Answer, 0, len(answers)),
	}
	if row.EndReason != nil {
		run.EndReason = quiz.EndReason(*row.EndReason)
	}
	for _, a := range answers {
		ans := quiz.Answer{Position: int(a.Position), ServedAt: a.ServedAt, AnsweredAt: a.AnsweredAt, Correct: a.Correct}
		if a.OptionIndex != nil {
			ans.Option = new(int(*a.OptionIndex))
		}
		run.Answers = append(run.Answers, ans)
	}
	return run, nil
}

// unit is one InRun transaction. saved holds each answer as stored, so SaveRun writes only changed ones.
type unit struct {
	ctx   context.Context
	q     *db.Queries
	run   *quiz.Run
	saved map[int]quiz.Answer
}

func (u *unit) Run() *quiz.Run { return u.run }

func (u *unit) Question(position int) (quiz.Question, bool, error) {
	row, err := u.q.GetQuestion(u.ctx, db.GetQuestionParams{QuizID: uuid.UUID(u.run.QuizID), Position: int16(position)})
	if errors.Is(err, pgx.ErrNoRows) {
		return quiz.Question{}, false, nil
	}
	if err != nil {
		return quiz.Question{}, false, err
	}
	q, err := toQuestion(row)
	return q, err == nil, err
}

// AddQuestion inserts q unless the position is taken. A concurrent insert of the same
// position blocks until the other transaction ends, so a later read sees the winner.
func (u *unit) AddQuestion(position int, q quiz.Question) error {
	var prompt *string
	if q.Prompt != "" {
		prompt = new(q.Prompt)
	}
	err := u.q.InsertQuestion(u.ctx, db.InsertQuestionParams{
		QuizID:       uuid.UUID(u.run.QuizID),
		Position:     int16(position),
		Type:         q.Type.ID(),
		Target:       q.Target,
		Prompt:       prompt,
		Options:      q.Options[:],
		CorrectIndex: int16(q.Correct),
	})
	if err != nil {
		return fmt.Errorf("insert question: %w", err)
	}
	return nil
}

func (u *unit) Targets() (map[string]bool, error) {
	targets, err := u.q.ListTargets(u.ctx, uuid.UUID(u.run.QuizID))
	if err != nil {
		return nil, err
	}
	used := make(map[string]bool, len(targets))
	for _, t := range targets {
		used[t] = true
	}
	return used, nil
}

// SaveRun writes the run row and every answer that differs from its stored state, in position order,
// so a resolved answer is written before the next open one.
func (u *unit) SaveRun(r *quiz.Run) error {
	var reason *string
	if r.EndReason != "" {
		reason = new(string(r.EndReason))
	}
	err := u.q.UpdateRun(u.ctx, db.UpdateRunParams{
		ID:         uuid.UUID(r.ID),
		Score:      int32(r.Score),
		FinishedAt: r.FinishedAt,
		EndReason:  reason,
	})
	if err != nil {
		return fmt.Errorf("update run: %w", err)
	}
	for _, a := range r.Answers {
		if old, ok := u.saved[a.Position]; ok && sameAnswer(old, a) {
			continue
		}
		var option *int16
		if a.Option != nil {
			option = new(int16(*a.Option))
		}
		err := u.q.UpsertRunAnswer(u.ctx, db.UpsertRunAnswerParams{
			RunID:       uuid.UUID(r.ID),
			Position:    int16(a.Position),
			ServedAt:    a.ServedAt,
			AnsweredAt:  a.AnsweredAt,
			OptionIndex: option,
			Correct:     a.Correct,
		})
		if err != nil {
			return fmt.Errorf("save answer %d: %w", a.Position, err)
		}
		u.saved[a.Position] = a
	}
	return nil
}

func sameAnswer(a, b quiz.Answer) bool {
	return a.ServedAt.Equal(b.ServedAt) && sameTime(a.AnsweredAt, b.AnsweredAt) &&
		samePtr(a.Option, b.Option) && samePtr(a.Correct, b.Correct)
}

func sameTime(a, b *time.Time) bool {
	return (a == nil) == (b == nil) && (a == nil || a.Equal(*b))
}

func samePtr[T comparable](a, b *T) bool {
	return (a == nil) == (b == nil) && (a == nil || *a == *b)
}

func toQuestion(row db.GetQuestionRow) (quiz.Question, error) {
	q := quiz.Question{Target: row.Target, Correct: int(row.CorrectIndex)}
	if row.Prompt != nil {
		q.Prompt = *row.Prompt
	}
	found := false
	for _, t := range quiz.Types {
		if t.ID() == row.Type {
			q.Type, found = t, true
			break
		}
	}
	if !found {
		return quiz.Question{}, fmt.Errorf("unknown question type %q", row.Type)
	}
	if len(row.Options) != len(q.Options) {
		return quiz.Question{}, fmt.Errorf("question has %d options", len(row.Options))
	}
	copy(q.Options[:], row.Options)
	return q, nil
}
