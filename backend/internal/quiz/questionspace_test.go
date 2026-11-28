package quiz

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/nicograef/what-the-flag/internal/country"
)

// realCatalogue returns the embedded catalogue through sharedPool.
func realCatalogue(t *testing.T) sharedPool {
	t.Helper()
	loaded, err := country.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return sharedPool{loaded, loaded.Pool()}
}

// space checks cases and questions against the raw catalogue lists, independently of candidates().
type space struct {
	cat    sharedPool
	byCode map[string]*country.Country
}

func newSpace(cat sharedPool) space {
	byCode := make(map[string]*country.Country, len(cat.pool))
	for i := range cat.pool {
		byCode[cat.pool[i].Code] = &cat.pool[i]
	}
	return space{cat: cat, byCode: byCode}
}

// holds reports whether option is a true answer of c.
func (s space) holds(c Case, option string) bool {
	if c.Type.Prompt == AttrRegionalLanguage {
		o := s.byCode[option]
		return o != nil && slices.Contains(o.RegionalLanguages, c.Prompt) && !slices.Contains(o.Languages, c.Prompt)
	}
	if c.Type.Answer.identifiesCountry() {
		return option == c.Target
	}
	return slices.Contains(values(s.byCode[c.Target], c.Type.Answer), option)
}

// defensible returns every option a player could defend as the answer of c.
func (s space) defensible(c Case) map[string]bool {
	target := s.byCode[c.Target]
	a := c.Type.Answer
	out := map[string]bool{}
	add := func(vs ...string) {
		for _, v := range vs {
			out[v] = true
		}
	}
	flag := c.Type.Prompt == AttrFlag || c.Type.Answer == AttrFlag
	if a.identifiesCountry() {
		add(target.Code)
		if c.Type.Prompt == AttrRegionalLanguage {
			for _, o := range s.cat.pool {
				if slices.Contains(o.Languages, c.Prompt) || slices.Contains(o.RegionalLanguages, c.Prompt) || slices.Contains(o.BlockedLanguages, c.Prompt) {
					add(o.Code)
				}
			}
		}
		if flag {
			add(target.Lookalikes...)
		}
		return out
	}
	switch a {
	case AttrRegion:
		add(target.Region)
		add(target.OtherRegions...)
	case AttrLanguage:
		add(target.Languages...)
		add(target.RegionalLanguages...)
		add(target.BlockedLanguages...)
	case AttrCurrency:
		add(target.Currencies...)
	case AttrName, AttrFlag, AttrCapital, AttrRegionalLanguage:
	}
	if c.Type.Prompt == AttrFlag {
		for _, code := range target.Lookalikes {
			add(values(s.byCode[code], a)...)
		}
	}
	kind := labelKind(a)
	families := map[string]bool{}
	for v := range out {
		if f := s.cat.Family(kind, v); f != "" {
			families[f] = true
		}
	}
	for _, o := range s.cat.pool {
		if len(families) == 0 {
			break
		}
		for _, v := range slices.Concat([]string{o.Region}, o.OtherRegions, o.Languages, o.RegionalLanguages, o.BlockedLanguages, o.Currencies) {
			if families[s.cat.Family(kind, v)] {
				add(v)
			}
		}
	}
	return out
}

// text is what an option displays, empty when it has no label.
func (s space) text(a Attr, option string) country.Names {
	if a.identifiesCountry() {
		if c := s.byCode[option]; c != nil {
			return answerText(c, a)
		}
		return country.Names{}
	}
	l, _ := s.cat.Label(labelKind(a), option)
	return l
}

// problems returns every rule q breaks.
func (s space) problems(q Question) []string {
	var out []string
	add := func(format string, args ...any) { out = append(out, fmt.Sprintf(format, args...)) }
	c := Case{Type: q.Type, Target: q.Target, Prompt: q.Prompt}
	if s.byCode[q.Target] == nil {
		return []string{fmt.Sprintf("target %q is no pool country", q.Target)}
	}
	if (q.Type.Prompt == AttrRegionalLanguage) != (q.Prompt != "") {
		add("prompt %q does not fit type %s", q.Prompt, q.Type.ID())
	}
	if !s.holds(c, q.Options[q.Correct]) {
		add("correct option %s is not true", q.Options[q.Correct])
	}
	def := s.defensible(c)
	a := q.Type.Answer
	kind := labelKind(a)
	flag := a.identifiesCountry() && (q.Type.Prompt == AttrFlag || q.Type.Answer == AttrFlag)
	for i, o := range q.Options {
		if i != q.Correct && def[o] {
			add("wrong option %s is defensible", o)
		}
		l := s.text(a, o)
		if l.De == "" || l.En == "" {
			add("option %s lacks a de or en label", o)
		}
		for _, p := range q.Options[:i] {
			pl := s.text(a, p)
			if l.De == pl.De || l.En == pl.En {
				add("options %s and %s share a text", p, o)
			}
			if f := s.cat.Family(kind, o); f != "" && f == s.cat.Family(kind, p) {
				add("options %s and %s share family %s", p, o, f)
			}
			if flag && slices.Contains(s.byCode[o].Lookalikes, p) {
				add("options %s and %s are look-alikes", p, o)
			}
		}
	}
	return out
}

// typeOf returns the type with id.
func typeOf(t *testing.T, id string) QuestionType {
	t.Helper()
	i := slices.IndexFunc(Types, func(ty QuestionType) bool { return ty.ID() == id })
	if i < 0 {
		t.Fatalf("no type %s", id)
	}
	return Types[i]
}

func TestQuestionSpace(t *testing.T) {
	cat := realCatalogue(t)
	s := newSpace(cat)
	cases := Cases(cat)
	thin := map[string][]string{}
	for _, c := range cases {
		name := fmt.Sprintf("%s %s [%s]", c.Type.ID(), c.Target, c.Prompt)
		sets := candidates(cat, cat.pool, c)
		for _, v := range sets.True {
			if !s.holds(c, v) {
				t.Errorf("%s: true code %s does not hold", name, v)
			}
		}
		def := s.defensible(c)
		got := map[string]bool{}
		for _, v := range slices.Concat(sets.True, sets.Contested) {
			got[v] = true
		}
		if !maps.Equal(got, def) {
			t.Errorf("%s: true ∪ contested %v, want the defensible set %v", name, slices.Sorted(maps.Keys(got)), slices.Sorted(maps.Keys(def)))
		}
		n := 0
		for _, group := range sets.False {
			n += len(group)
			for _, v := range group {
				if def[v] {
					t.Errorf("%s: false candidate %s is defensible", name, v)
				}
			}
		}
		if n < 6 {
			thin[c.Type.ID()] = append(thin[c.Type.ID()], c.Target+c.Prompt)
		}
		q, ok := Draw(cat, c, 1, newRand(1))
		switch {
		case !ok && n < 3:
			// Too few false candidates make a case ineligible; Generate then asks another type.
			t.Logf("%s: ineligible, %d false candidates", name, n)
			continue
		case !ok:
			t.Errorf("%s: no question, though %d false candidates remain", name, n)
			continue
		}
		for _, p := range s.problems(q) {
			t.Errorf("%s: %+v: %s", name, q, p)
		}
	}
	t.Logf("%d cases", len(cases))
	for _, id := range slices.Sorted(maps.Keys(thin)) {
		t.Logf("%s: %d cases with fewer than 6 candidates: %v", id, len(thin[id]), thin[id])
	}

	// Each hand-built question breaks one rule, which the checker must report.
	flagName, nameRegion, nameLanguage := typeOf(t, "flag_name"), typeOf(t, "name_region"), typeOf(t, "name_language")
	nameCurrency, regional := typeOf(t, "name_currency"), typeOf(t, "regional_language_name")
	broken := []struct {
		name string
		q    Question
		want string
	}{
		{"correct option not true", Question{Type: flagName, Target: "DE", Options: [4]string{"FR", "IT", "ES", "PL"}}, "is not true"},
		{"other region offered", Question{Type: nameRegion, Target: "TR", Options: [4]string{"Asia", "Europe", "Africa", "Oceania"}}, "Europe is defensible"},
		{"blocked language offered", Question{Type: nameLanguage, Target: "IL", Options: [4]string{"he", "ar", "fr", "ru"}}, "ar is defensible"},
		{"country speaking the prompt offered", Question{Type: regional, Target: "DE", Prompt: "li", Options: [4]string{"DE", "NL", "FR", "IT"}}, "NL is defensible"},
		{"look-alike offered", Question{Type: flagName, Target: "ID", Options: [4]string{"ID", "MC", "FR", "IT"}}, "MC is defensible"},
		{"two look-alikes", Question{Type: flagName, Target: "DE", Options: [4]string{"DE", "RO", "TD", "IT"}}, "are look-alikes"},
		{"repeated option", Question{Type: flagName, Target: "DE", Options: [4]string{"DE", "FR", "FR", "IT"}}, "share a text"},
		{"shared family", Question{Type: nameCurrency, Target: "DE", Options: [4]string{"EUR", "USD", "CAD", "JPY"}}, "share family"},
		{"unlabelled option", Question{Type: nameLanguage, Target: "DE", Options: [4]string{"de", "fr", "xx", "ru"}}, "lacks a de or en label"},
		{"prompt on a prompt-less type", Question{Type: flagName, Target: "DE", Prompt: "li", Options: [4]string{"DE", "FR", "IT", "ES"}}, "does not fit"},
	}
	for _, b := range broken {
		got := s.problems(b.q)
		if !slices.ContainsFunc(got, func(p string) bool { return strings.Contains(p, b.want) }) {
			t.Errorf("%s: problems %q lack %q", b.name, got, b.want)
		}
	}
}
