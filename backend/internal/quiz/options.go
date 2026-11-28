package quiz

import (
	"slices"

	"github.com/nicograef/what-the-flag/internal/country"
)

// minRegion is the region size, target included, from which distractor countries come from the target's region first.
const minRegion = 8

// Case is one entry of the question space: a type, a target code and, for a regional-language prompt, the language code.
type Case struct {
	Type   QuestionType
	Target string
	Prompt string
}

// optionSets splits a case's candidate options by status. True holds the correct answers; Contested holds the
// answers a player could defend though they are not true. False holds every other candidate, in ordered groups.
type optionSets struct {
	True      []string
	Contested []string
	False     [][]string
}

// Cases enumerates the question space: every type with every pool target and, for a prompt type, every prompt.
func Cases(cat Catalogue) []Case {
	pool := cat.Pool()
	var cases []Case
	for _, t := range Types {
		for i := range pool {
			cases = append(cases, targetCases(t, &pool[i])...)
		}
	}
	return cases
}

// targetCases returns the cases of one type and target: one per prompt for a prompt type, else one.
func targetCases(t QuestionType, target *country.Country) []Case {
	if t.Prompt != AttrRegionalLanguage {
		return []Case{{Type: t, Target: target.Code}}
	}
	var cases []Case
	for _, l := range target.RegionalLanguages {
		// An official language of the target would name it, as Mongolian names Mongolia.
		if !slices.Contains(target.Languages, l) {
			cases = append(cases, Case{Type: t, Target: target.Code, Prompt: l})
		}
	}
	return cases
}

// Draw builds one question for c at a run level, or reports false when fewer than three wrong options fit.
// The correct option is the target when the true set holds it, else a uniform draw from the true set.
// Every level draws from the same candidate groups.
func Draw(cat Catalogue, c Case, level int, rnd Rand) (Question, bool) {
	pool := cat.Pool()
	sets := candidates(cat, pool, c)
	if len(sets.True) == 0 {
		return Question{}, false
	}
	correct := c.Target
	if !slices.Contains(sets.True, correct) {
		correct = sets.True[rnd.IntN(len(sets.True))]
	}

	answer := c.Type.Answer
	kind := labelKind(answer)
	lookalikes := flagType(c.Type) && answer.identifiesCountry()
	var texts []country.Names
	families := map[string]bool{}
	// mark records an option's text and family; the true and contested sets are marked so no candidate repeats them.
	mark := func(v string) {
		if l, ok := optionText(cat, pool, answer, v); ok {
			texts = append(texts, l)
		}
		if f := cat.Family(kind, v); kind != "" && f != "" {
			families[f] = true
		}
	}
	for _, v := range slices.Concat(sets.True, sets.Contested) {
		mark(v)
	}
	clashes := func(v string, l country.Names, picked []string) bool {
		if slices.ContainsFunc(texts, func(t country.Names) bool { return t.De == l.De || t.En == l.En }) {
			return true
		}
		if kind != "" && families[cat.Family(kind, v)] {
			return true
		}
		return lookalikes && slices.ContainsFunc(picked, func(p string) bool { return slices.Contains(countryOf(pool, p).Lookalikes, v) })
	}

	options := []string{correct}
	for _, group := range sets.False {
		group = slices.Clone(group)
		rnd.Shuffle(len(group), func(i, j int) { group[i], group[j] = group[j], group[i] })
		for _, v := range group {
			l, ok := optionText(cat, pool, answer, v)
			if !ok || l.De == "" || l.En == "" || clashes(v, l, options) {
				continue
			}
			mark(v)
			options = append(options, v)
			if len(options) == 4 {
				q := shuffled(c.Type, c.Target, options, rnd)
				q.Prompt = c.Prompt
				return q, true
			}
		}
	}
	return Question{}, false
}

// shuffled builds the question from options whose first entry is the correct one.
func shuffled(t QuestionType, target string, options []string, rnd Rand) Question {
	order := [4]int{0, 1, 2, 3}
	rnd.Shuffle(4, func(i, j int) { order[i], order[j] = order[j], order[i] })
	q := Question{Type: t, Target: target}
	for i, o := range order {
		q.Options[i] = options[o]
		if o == 0 {
			q.Correct = i
		}
	}
	return q
}

// candidates returns c's true, contested and false sets. The false groups are the target's region first,
// for a country answer only when the region holds at least minRegion countries, then the rest of the pool.
func candidates(cat Catalogue, pool []country.Country, c Case) optionSets {
	target := countryOf(pool, c.Target)
	if target == nil {
		return optionSets{}
	}
	answer := c.Type.Answer
	var sets optionSets
	if answer.identifiesCountry() {
		sets.True = []string{target.Code}
		if c.Type.Prompt == AttrRegionalLanguage {
			sets.True = nil
			for i := range pool {
				if speaks(&pool[i], c.Prompt) {
					sets.True = append(sets.True, pool[i].Code)
				} else if holdsLanguage(&pool[i], c.Prompt) {
					sets.Contested = append(sets.Contested, pool[i].Code)
				}
			}
		}
		if flagType(c.Type) {
			sets.Contested = append(sets.Contested, target.Lookalikes...)
		}
		var region, rest []string
		for i := range pool {
			code := pool[i].Code
			switch {
			case slices.Contains(sets.True, code) || slices.Contains(sets.Contested, code):
			case pool[i].Region == target.Region:
				region = append(region, code)
			default:
				rest = append(rest, code)
			}
		}
		if regionSize(pool, target.Region) < minRegion {
			rest = slices.Concat(region, rest)
			region = nil
		}
		sets.False = [][]string{region, rest}
		return sets
	}

	sets.True = slices.Clone(values(target, answer))
	var direct []string
	switch answer {
	case AttrRegion:
		direct = slices.Clone(target.OtherRegions)
	case AttrLanguage:
		direct = slices.Concat(target.RegionalLanguages, target.BlockedLanguages)
	case AttrName, AttrFlag, AttrCapital, AttrCurrency, AttrRegionalLanguage:
	}
	if c.Type.Prompt == AttrFlag {
		for _, code := range target.Lookalikes {
			direct = append(direct, values(countryOf(pool, code), answer)...)
		}
	}
	kind := labelKind(answer)
	families := map[string]bool{}
	for _, v := range slices.Concat(sets.True, direct) {
		if f := cat.Family(kind, v); f != "" {
			families[f] = true
		}
	}
	contested := slices.Clone(direct)
	if len(families) > 0 {
		for _, v := range universe(pool, answer) {
			if families[cat.Family(kind, v)] {
				contested = append(contested, v)
			}
		}
	}
	for _, v := range contested {
		if !slices.Contains(sets.True, v) && !slices.Contains(sets.Contested, v) {
			sets.Contested = append(sets.Contested, v)
		}
	}
	seen := map[string]bool{}
	for _, v := range slices.Concat(sets.True, sets.Contested) {
		seen[v] = true
	}
	collect := func(inRegion bool) []string {
		var vs []string
		for i := range pool {
			if (pool[i].Region == target.Region) != inRegion {
				continue
			}
			for _, v := range values(&pool[i], answer) {
				if !seen[v] {
					seen[v] = true
					vs = append(vs, v)
				}
			}
		}
		return vs
	}
	sets.False = [][]string{collect(true), collect(false)}
	return sets
}

// speaks reports whether lang is a regional language of c and not an official one: a true answer to its prompt.
func speaks(c *country.Country, lang string) bool {
	return slices.Contains(c.RegionalLanguages, lang) && !slices.Contains(c.Languages, lang)
}

// holdsLanguage reports whether lang is in any of c's language lists.
func holdsLanguage(c *country.Country, lang string) bool {
	return slices.Contains(c.Languages, lang) || slices.Contains(c.RegionalLanguages, lang) || slices.Contains(c.BlockedLanguages, lang)
}

// flagType reports whether a type shows a flag as its prompt or its options.
func flagType(t QuestionType) bool { return t.Prompt == AttrFlag || t.Answer == AttrFlag }

// universe returns every code of an answer attribute's kind that some pool country holds in any list, in pool order.
func universe(pool []country.Country, a Attr) []string {
	var out []string
	seen := map[string]bool{}
	for i := range pool {
		c := &pool[i]
		var vs []string
		switch a {
		case AttrRegion:
			vs = slices.Concat([]string{c.Region}, c.OtherRegions)
		case AttrLanguage:
			vs = slices.Concat(c.Languages, c.RegionalLanguages, c.BlockedLanguages)
		case AttrCurrency:
			vs = c.Currencies
		case AttrName, AttrFlag, AttrCapital, AttrRegionalLanguage:
		}
		for _, v := range vs {
			if !seen[v] {
				seen[v] = true
				out = append(out, v)
			}
		}
	}
	return out
}

// optionText is what an option displays: a country's answer text or an attribute label.
func optionText(cat Catalogue, pool []country.Country, a Attr, option string) (country.Names, bool) {
	if a.identifiesCountry() {
		c := countryOf(pool, option)
		if c == nil {
			return country.Names{}, false
		}
		return answerText(c, a), true
	}
	return cat.Label(labelKind(a), option)
}

// countryOf returns the pool country with code, or nil.
func countryOf(pool []country.Country, code string) *country.Country {
	for i := range pool {
		if pool[i].Code == code {
			return &pool[i]
		}
	}
	return nil
}

func regionSize(pool []country.Country, region string) int {
	n := 0
	for i := range pool {
		if pool[i].Region == region {
			n++
		}
	}
	return n
}
