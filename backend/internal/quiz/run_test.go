package quiz

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestRun(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	at := t0.Add
	// playing has answered position 0 correctly and holds position 1 open, served at t0.
	playing := func() *Run {
		return &Run{Score: 1, Answers: []Answer{
			{Position: 0, ServedAt: at(-10 * time.Second), AnsweredAt: new(at(-5 * time.Second)), Option: new(2), Correct: new(true)},
			{Position: 1, ServedAt: t0},
		}}
	}
	first := playing().Answers[0]
	answer := func(position int, option *int, d time.Duration) func(r *Run) (Outcome, error) {
		return func(r *Run) (Outcome, error) { return r.Answer(position, option, 3, at(d)) }
	}

	tests := []struct {
		name    string
		act     func(r *Run) (Outcome, error)
		want    Outcome
		wantErr error
		wantRun Run
	}{
		{
			name: "correct at 300 ms scores",
			act:  answer(1, new(3), MinAnswer),
			want: Outcome{Position: 1, Correct: true, ChosenOption: new(3), CorrectOption: 3, Score: 2},
			wantRun: Run{Score: 2, Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(MinAnswer)), Option: new(3), Correct: new(true)}}},
		},
		{
			name: "correct under 300 ms ends wrong",
			act:  answer(1, new(3), MinAnswer-time.Millisecond),
			want: Outcome{Position: 1, ChosenOption: new(3), CorrectOption: 3, Finished: true, Score: 1},
			wantRun: Run{Score: 1, EndReason: EndWrong, FinishedAt: new(at(299 * time.Millisecond)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(299 * time.Millisecond)), Option: new(3), Correct: new(false)}}},
		},
		{
			name: "wrong option ends wrong",
			act:  answer(1, new(0), time.Second),
			want: Outcome{Position: 1, ChosenOption: new(0), CorrectOption: 3, Finished: true, Score: 1},
			wantRun: Run{Score: 1, EndReason: EndWrong, FinishedAt: new(at(time.Second)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(time.Second)), Option: new(0), Correct: new(false)}}},
		},
		{
			name: "null option ends timeout",
			act:  answer(1, nil, 15*time.Second),
			want: Outcome{Position: 1, TimedOut: true, CorrectOption: 3, Finished: true, Score: 1},
			wantRun: Run{Score: 1, EndReason: EndTimeout, FinishedAt: new(at(15 * time.Second)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(15 * time.Second)), Correct: new(false)}}},
		},
		{
			name: "correct at 17 s still counts",
			act:  answer(1, new(3), Limit+Grace),
			want: Outcome{Position: 1, Correct: true, ChosenOption: new(3), CorrectOption: 3, Score: 2},
			wantRun: Run{Score: 2, Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(Limit + Grace)), Option: new(3), Correct: new(true)}}},
		},
		{
			name: "answer after 17 s gets the stored timeout",
			act:  answer(1, new(3), Limit+Grace+time.Millisecond),
			want: Outcome{Position: 1, TimedOut: true, CorrectOption: 3, Finished: true, Score: 1},
			wantRun: Run{Score: 1, EndReason: EndTimeout, FinishedAt: new(at(Limit + Grace)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, Correct: new(false)}}},
		},
		{
			name: "expire after 17 s ends timeout at 17 s",
			act: func(r *Run) (Outcome, error) {
				r.Expire(at(time.Minute))
				return Outcome{}, nil
			},
			wantRun: Run{Score: 1, EndReason: EndTimeout, FinishedAt: new(at(Limit + Grace)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, Correct: new(false)}}},
		},
		{
			name:    "resolved position returns its stored outcome",
			act:     answer(0, new(1), time.Second),
			want:    Outcome{Position: 0, Correct: true, ChosenOption: new(2), CorrectOption: 3, Score: 1},
			wantRun: *playing(),
		},
		{
			name:    "never served position",
			act:     answer(2, new(3), time.Second),
			wantErr: ErrNotCurrentQuestion,
			wantRun: *playing(),
		},
		{
			name:    "option outside 0..3",
			act:     answer(1, new(4), time.Second),
			wantErr: ErrInvalidOption,
			wantRun: *playing(),
		},
		{
			name: "exhausted quiz completes the run",
			act: func(r *Run) (Outcome, error) {
				if _, err := r.Answer(1, new(3), 3, at(time.Second)); err != nil {
					return Outcome{}, err
				}
				r.Complete(at(2 * time.Second))
				return Outcome{}, nil
			},
			wantRun: Run{Score: 2, EndReason: EndCompleted, FinishedAt: new(at(2 * time.Second)), Answers: []Answer{first,
				{Position: 1, ServedAt: t0, AnsweredAt: new(at(time.Second)), Option: new(3), Correct: new(true)}}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := playing()
			got, err := tt.act(r)
			if !errors.Is(err, tt.wantErr) || !reflect.DeepEqual(got, tt.want) {
				t.Errorf("outcome = %+v, %v; want %+v, %v", got, err, tt.want, tt.wantErr)
			}
			if !reflect.DeepEqual(*r, tt.wantRun) {
				t.Errorf("run = %+v\nwant  %+v", *r, tt.wantRun)
			}
		})
	}
}
