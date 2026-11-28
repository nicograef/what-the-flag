package httpapi

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// presenter turns core values into wire values. No wire value holds an alpha-2 code:
// a country travels as its flag key or its name or capital label, an attribute code as its label.
type presenter struct {
	cat       quiz.Catalogue
	countries map[string]*country.Country
}

func newPresenter(cat quiz.Catalogue) *presenter {
	pool := cat.Pool()
	countries := make(map[string]*country.Country, len(pool))
	for i := range pool {
		countries[pool[i].Code] = &pool[i]
	}
	return &presenter{cat: cat, countries: countries}
}

// item is a prompt or an option: {"kind":"flag","flagKey"} or {"kind":"text","text":{"de","en"}}.
type item struct {
	Kind    string         `json:"kind"`
	FlagKey string         `json:"flagKey,omitempty"`
	Text    *country.Names `json:"text,omitempty"`
}

type runState struct {
	ID        uuid.UUID `json:"id"`
	QuizID    uuid.UUID `json:"quizId"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Score     int       `json:"score"`
	ServerNow time.Time `json:"serverNow"`
	Question  *question `json:"question"`
	Result    *result   `json:"result"`
}

type question struct {
	Position int       `json:"position"`
	Type     string    `json:"type"`
	Prompt   item      `json:"prompt"`
	Options  [4]item   `json:"options"`
	Deadline time.Time `json:"deadline"`
	LimitMs  int64     `json:"limitMs"`
}

type result struct {
	Score      int     `json:"score"`
	EndReason  string  `json:"endReason"`
	Last       *missed `json:"last"`
	QuizRank   int     `json:"quizRank"`
	GlobalRank *int    `json:"globalRank"`
}

// entry is a leaderboard row; own is present only on the requester's row.
type entry struct {
	Rank  int    `json:"rank"`
	Name  string `json:"name"`
	Score int    `json:"score"`
	Own   bool   `json:"own,omitempty"`
}

type missed struct {
	Position      int     `json:"position"`
	Type          string  `json:"type"`
	Prompt        item    `json:"prompt"`
	Options       [4]item `json:"options"`
	CorrectOption int     `json:"correctOption"`
	ChosenOption  *int    `json:"chosenOption"`
}

type outcome struct {
	Position      int  `json:"position"`
	Correct       bool `json:"correct"`
	TimedOut      bool `json:"timedOut"`
	ChosenOption  *int `json:"chosenOption"`
	CorrectOption int  `json:"correctOption"`
	Finished      bool `json:"finished"`
	Score         int  `json:"score"`
}

func (p *presenter) state(st quiz.RunState) (runState, error) {
	out := runState{
		ID:        uuid.UUID(st.ID),
		QuizID:    uuid.UUID(st.QuizID),
		Name:      st.Name,
		Status:    "playing",
		Score:     st.Score,
		ServerNow: st.Now,
	}
	if st.Question != nil {
		prompt, options, err := p.question(st.Question.Question)
		if err != nil {
			return runState{}, err
		}
		out.Question = &question{
			Position: st.Question.Position,
			Type:     st.Question.Question.Type.ID(),
			Prompt:   prompt,
			Options:  options,
			Deadline: st.Question.Deadline,
			LimitMs:  quiz.Limit.Milliseconds(),
		}
	}
	if st.Result != nil {
		out.Status = "finished"
		out.Result = &result{
			Score:      st.Result.Score,
			EndReason:  string(st.Result.EndReason),
			QuizRank:   st.Result.QuizRank,
			GlobalRank: st.Result.GlobalRank,
		}
		if last := st.Result.Last; last != nil {
			prompt, options, err := p.question(last.Question)
			if err != nil {
				return runState{}, err
			}
			out.Result.Last = &missed{
				Position:      last.Position,
				Type:          last.Question.Type.ID(),
				Prompt:        prompt,
				Options:       options,
				CorrectOption: last.Question.Correct,
				ChosenOption:  last.Chosen,
			}
		}
	}
	return out, nil
}

// question presents a question's prompt and options; the target and the correct index stay out.
func (p *presenter) question(q quiz.Question) (item, [4]item, error) {
	var options [4]item
	target, ok := p.countries[q.Target]
	if !ok {
		return item{}, options, fmt.Errorf("unknown target %q", q.Target)
	}
	var prompt item
	var err error
	if q.Type.Prompt == quiz.AttrRegionalLanguage {
		prompt, err = p.label(country.LabelLanguage, q.Prompt)
	} else {
		prompt, err = countryItem(target, q.Type.Prompt)
	}
	if err != nil {
		return item{}, options, err
	}
	for i, code := range q.Options {
		if options[i], err = p.option(q.Type.Answer, code); err != nil {
			return item{}, options, err
		}
	}
	return prompt, options, nil
}

func (p *presenter) option(a quiz.Attr, code string) (item, error) {
	var kind country.LabelKind
	switch a {
	case quiz.AttrName, quiz.AttrFlag, quiz.AttrCapital:
		c, ok := p.countries[code]
		if !ok {
			return item{}, fmt.Errorf("unknown option country %q", code)
		}
		return countryItem(c, a)
	case quiz.AttrRegion:
		kind = country.LabelRegion
	case quiz.AttrLanguage:
		kind = country.LabelLanguage
	case quiz.AttrCurrency:
		kind = country.LabelCurrency
	case quiz.AttrRegionalLanguage:
		return item{}, fmt.Errorf("attribute %q is no answer", a)
	}
	return p.label(kind, code)
}

// label presents an attribute code by its label.
func (p *presenter) label(kind country.LabelKind, code string) (item, error) {
	names, ok := p.cat.Label(kind, code)
	if !ok {
		return item{}, fmt.Errorf("no %s label for %q", kind, code)
	}
	return textItem(names), nil
}

// countryItem presents a country by a country-valued attribute.
func countryItem(c *country.Country, a quiz.Attr) (item, error) {
	switch a {
	case quiz.AttrFlag:
		return item{Kind: "flag", FlagKey: c.FlagKey}, nil
	case quiz.AttrName:
		return textItem(c.Name), nil
	case quiz.AttrCapital:
		return textItem(c.Capital), nil
	case quiz.AttrRegion, quiz.AttrLanguage, quiz.AttrCurrency, quiz.AttrRegionalLanguage:
	}
	return item{}, fmt.Errorf("attribute %q does not identify a country", a)
}

func textItem(n country.Names) item {
	return item{Kind: "text", Text: &n}
}

func presentOutcome(o quiz.Outcome) outcome {
	return outcome{
		Position:      o.Position,
		Correct:       o.Correct,
		TimedOut:      o.TimedOut,
		ChosenOption:  o.ChosenOption,
		CorrectOption: o.CorrectOption,
		Finished:      o.Finished,
		Score:         o.Score,
	}
}

func presentEntries(es []quiz.Entry) []entry {
	out := make([]entry, len(es))
	for i, e := range es {
		out[i] = entry{Rank: e.Rank, Name: e.Name, Score: e.Score, Own: e.Own}
	}
	return out
}
