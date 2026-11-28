package httpapi

import (
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// presenter turns core values into wire values. No wire value holds an alpha-2 code:
// a country travels as its flag key or its name or capital label, an attribute code as its label.
type presenter struct {
	cat       quiz.Catalogue
	pool      []country.Country
	countries map[string]*country.Country
}

func newPresenter(cat quiz.Catalogue) *presenter {
	pool := cat.Pool()
	countries := make(map[string]*country.Country, len(pool))
	for i := range pool {
		countries[pool[i].Code] = &pool[i]
	}
	return &presenter{cat: cat, pool: pool, countries: countries}
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
	Level    int       `json:"level"`
	Type     string    `json:"type"`
	Prompt   item      `json:"prompt"`
	Options  [4]item   `json:"options"`
	Deadline time.Time `json:"deadline"`
	LimitMs  int64     `json:"limitMs"`
}

// result.Level is the level of the run's last question. Fact is present after a miss only.
type result struct {
	Score      int     `json:"score"`
	Level      int     `json:"level"`
	EndReason  string  `json:"endReason"`
	Last       *missed `json:"last"`
	Fact       *fact   `json:"fact,omitempty"`
	QuizRank   int     `json:"quizRank"`
	GlobalRank *int    `json:"globalRank"`
	Best       best    `json:"best"`
}

// fact is what the learning card shows about a missed question's target. Languages are the official ones and
// currencies their units. ChosenCountry is the country of the picked option, null where quiz.ChosenCountry finds
// none. SpokenIn, only for a regional-language prompt, lists the countries where its language is official or regional.
type fact struct {
	Name          country.Names   `json:"name"`
	Flag          string          `json:"flag"`
	Capital       country.Names   `json:"capital"`
	Region        country.Names   `json:"region"`
	Languages     []country.Names `json:"languages"`
	Currencies    []country.Names `json:"currencies"`
	ChosenCountry *country.Names  `json:"chosenCountry"`
	SpokenIn      []country.Names `json:"spokenIn,omitempty"`
}

type best struct {
	Score    int  `json:"score"`
	IsNew    bool `json:"isNew"`
	Previous *int `json:"previous"`
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
			Level:    quiz.Level(st.Question.Position),
			Type:     st.Question.Question.Type.ID(),
			Prompt:   prompt,
			Options:  options,
			Deadline: st.Question.Deadline,
			LimitMs:  quiz.Limit.Milliseconds(),
		}
	}
	if st.Result != nil {
		out.Status = "finished"
		// A completed run's last question earned its last point; a missed run's last question is the miss.
		lastPosition := max(0, st.Result.Score-1)
		if st.Result.Last != nil {
			lastPosition = st.Result.Last.Position
		}
		out.Result = &result{
			Score:      st.Result.Score,
			Level:      quiz.Level(lastPosition),
			EndReason:  string(st.Result.EndReason),
			QuizRank:   st.Result.QuizRank,
			GlobalRank: st.Result.GlobalRank,
			Best:       best{Score: st.Result.Best.Score, IsNew: st.Result.Best.IsNew, Previous: st.Result.Best.Previous},
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
			if out.Result.Fact, err = p.fact(last); err != nil {
				return runState{}, err
			}
		}
	}
	return out, nil
}

// fact presents the learning-card facts of a missed question, all from the catalogue.
func (p *presenter) fact(last *quiz.Missed) (*fact, error) {
	q := last.Question
	target, ok := p.countries[q.Target]
	if !ok {
		return nil, fmt.Errorf("unknown target %q", q.Target)
	}
	labels := func(kind country.LabelKind, codes []string) ([]country.Names, error) {
		out := make([]country.Names, len(codes))
		for i, code := range codes {
			n, ok := p.cat.Label(kind, code)
			if !ok {
				return nil, fmt.Errorf("no %s label for %q", kind, code)
			}
			out[i] = n
		}
		return out, nil
	}
	f := &fact{Name: target.Name, Flag: target.FlagKey, Capital: target.Capital}
	region, err := labels(country.LabelRegion, []string{target.Region})
	if err != nil {
		return nil, err
	}
	f.Region = region[0]
	if f.Languages, err = labels(country.LabelLanguage, target.Languages); err != nil {
		return nil, err
	}
	if f.Currencies, err = labels(country.LabelCurrency, target.Currencies); err != nil {
		return nil, err
	}
	if c := quiz.ChosenCountry(p.pool, q, last.Chosen); c != nil {
		f.ChosenCountry = &c.Name
	}
	if q.Type.Prompt == quiz.AttrRegionalLanguage {
		f.SpokenIn = []country.Names{}
		for i := range p.pool {
			if c := &p.pool[i]; slices.Contains(c.Languages, q.Prompt) || slices.Contains(c.RegionalLanguages, q.Prompt) {
				f.SpokenIn = append(f.SpokenIn, c.Name)
			}
		}
	}
	return f, nil
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
