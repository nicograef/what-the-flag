package quiz

import (
	"errors"
	"maps"
	"math/rand/v2"
	"slices"
	"sync"
	"testing"

	"github.com/nicograef/what-the-flag/internal/country"
)

// newRand is the fixed random source of the core's tests.
func newRand(seed uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, seed)) //nolint:gosec // G404: a seeded test source, no secret depends on it.
}

// sharedPool serves the real catalogue without cloning the pool per call, which dominates TestGenerate's time.
// Generate never writes to the pool it gets.
type sharedPool struct {
	*country.Catalogue
	pool []country.Country
}

func (s sharedPool) Pool() []country.Country { return s.pool }

func TestGenerate(t *testing.T) {
	loaded, err := country.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	cat := sharedPool{loaded, loaded.Pool()}
	var mu sync.Mutex
	seen := map[string]bool{}
	const runs, shards = 200, 8
	// The group returns once every parallel shard has finished.
	t.Run("runs", func(t *testing.T) {
		for shard := range uint64(shards) {
			t.Run("", func(t *testing.T) {
				t.Parallel()
				for seed := shard; seed < runs; seed += shards {
					types := checkRun(t, cat, seed)
					mu.Lock()
					maps.Copy(seen, types)
					mu.Unlock()
				}
			})
		}
	})
	for _, ty := range Types {
		if !seen[ty.ID()] {
			t.Errorf("type %s never occurred", ty.ID())
		}
	}
	t.Run("five-country catalogue", fiveCountries)
}

// checkRun generates one run's questions from position 0 until the pool is exhausted,
// checks each against the question rules and returns the type ids that occurred.
func checkRun(t *testing.T, cat sharedPool, seed uint64) map[string]bool {
	t.Helper()
	byCode := make(map[string]*country.Country, len(cat.pool))
	regionSize := map[string]int{}
	for i := range cat.pool {
		byCode[cat.pool[i].Code] = &cat.pool[i]
		regionSize[cat.pool[i].Region]++
	}
	// text is what an option displays: a country's answer text or an attribute label.
	text := func(ty QuestionType, option string) country.Names {
		if ty.Answer.identifiesCountry() {
			return answerText(byCode[option], ty.Answer)
		}
		l, _ := cat.Label(labelKind(ty.Answer), option)
		return l
	}
	rnd := newRand(seed)
	used := map[string]bool{}
	types := map[string]bool{}
	for position := 0; ; position++ {
		wantTier, wantFame := min(4, 1+position/5), min(3, 1+position/8)
		famousLeft := slices.ContainsFunc(cat.pool, func(c country.Country) bool { return !used[c.Code] && c.Fame <= wantFame })
		q, err := Generate(cat, position, used, rnd)
		if position == len(cat.pool) {
			if !errors.Is(err, errQuizExhausted) {
				t.Fatalf("seed %d position %d: err %v, want errQuizExhausted", seed, position, err)
			}
			return types
		}
		if err != nil {
			t.Fatalf("seed %d position %d: %v", seed, position, err)
		}
		fail := func(format string, args ...any) {
			t.Helper()
			t.Fatalf("seed %d position %d %+v: "+format, append([]any{seed, position, q}, args...)...)
		}
		types[q.Type.ID()] = true
		target := byCode[q.Target]
		if used[q.Target] {
			fail("target repeats")
		}
		used[q.Target] = true
		if q.Type.Tier > wantTier {
			fail("tier above %d", wantTier)
		}
		if famousLeft && target.Fame > wantFame {
			fail("fame %d above %d", target.Fame, wantFame)
		}
		// spoken reports whether a regional-language question's prompt is spoken in c; such a c is never a distractor.
		spoken := func(c *country.Country) bool {
			return q.Type.Prompt == AttrRegionalLanguage && slices.Contains(c.RegionalLanguages, q.Prompt)
		}
		if (q.Type.Prompt == AttrRegionalLanguage) != (q.Prompt != "") || (q.Prompt != "" && !spoken(target)) {
			fail("prompt %q is not a regional language of the target, or is set for another type", q.Prompt)
		}
		if slices.Contains(target.Languages, q.Prompt) {
			fail("prompt %q is an official language of the target", q.Prompt)
		}
		own := []string{q.Target}
		// blocked holds values the target lacks that a player could still defend; no option may carry one.
		var blocked []string
		if !q.Type.Answer.identifiesCountry() {
			own = values(target, q.Type.Answer)
			switch q.Type.Answer {
			case AttrRegion:
				blocked = append(blocked, target.OtherRegions...)
			case AttrLanguage:
				blocked = append(blocked, target.RegionalLanguages...)
				blocked = append(blocked, target.BlockedLanguages...)
			case AttrName, AttrFlag, AttrCapital, AttrCurrency, AttrRegionalLanguage:
			}
			if q.Type.Prompt == AttrFlag {
				for _, code := range target.Lookalikes {
					blocked = append(blocked, values(byCode[code], q.Type.Answer)...)
				}
			}
		}
		flagCountries := (q.Type.Prompt == AttrFlag || q.Type.Answer == AttrFlag) && q.Type.Answer.identifiesCountry()
		// families holds the language or currency families taken: the target's and each distractor's so far.
		// Every currency has a family; most languages have none.
		kind := labelKind(q.Type.Answer)
		hasFamily := q.Type.Answer == AttrCurrency || q.Type.Answer == AttrLanguage
		families := map[string]bool{}
		if hasFamily {
			for _, v := range own {
				families[cat.Family(kind, v)] = true
			}
		}
		des, ens := map[string]bool{}, map[string]bool{}
		for i, o := range q.Options {
			if (i == q.Correct) != slices.Contains(own, o) {
				fail("option %d %q: correct %t, true for the target %t", i, o, i == q.Correct, slices.Contains(own, o))
			}
			if i != q.Correct && slices.Contains(blocked, o) {
				fail("option %d %q is another region, a regional or blocked language of the target, or belongs to its look-alike", i, o)
			}
			if i != q.Correct && q.Type.Answer.identifiesCountry() && spoken(byCode[o]) {
				fail("option %d %q is a country where %s is spoken", i, o, q.Prompt)
			}
			l := text(q.Type, o)
			if l.De == "" || l.En == "" || des[l.De] || ens[l.En] {
				fail("option %d text %+v is empty or repeats", i, l)
			}
			des[l.De], ens[l.En] = true, true
			if hasFamily && i != q.Correct {
				f := cat.Family(kind, o)
				if (f == "" && q.Type.Answer == AttrCurrency) || (f != "" && families[f]) {
					fail("option %d %q: family %q is missing or shared with the target or another option", i, o, f)
				}
				families[f] = f != ""
			}
			if flagCountries {
				for _, other := range q.Options {
					if slices.Contains(byCode[o].Lookalikes, other) {
						fail("look-alikes %s and %s", o, other)
					}
				}
			}
		}
		// A distractor country may leave a region of eight or more only when every other country there
		// clashes with an option or speaks the prompted regional language.
		if q.Type.Answer.identifiesCountry() && regionSize[target.Region] >= 8 {
			clashes := func(c *country.Country) bool {
				return spoken(c) || slices.ContainsFunc(q.Options[:], func(o string) bool {
					l, ol := answerText(c, q.Type.Answer), text(q.Type, o)
					return l.De == ol.De || l.En == ol.En || (flagCountries && slices.Contains(byCode[o].Lookalikes, c.Code))
				})
			}
			for _, o := range q.Options {
				if byCode[o].Region == target.Region {
					continue
				}
				for i := range cat.pool {
					c := &cat.pool[i]
					if c.Region == target.Region && !slices.Contains(q.Options[:], c.Code) && !clashes(c) {
						fail("option %s is outside %s, though %s fits", o, target.Region, c.Code)
					}
				}
			}
		}
	}
}

// fakeCatalogue is a literal pool whose labels and families are their codes.
type fakeCatalogue []country.Country

func (f fakeCatalogue) Pool() []country.Country { return slices.Clone(f) }

func (f fakeCatalogue) Label(_ country.LabelKind, code string) (country.Names, bool) {
	return country.Names{De: code, En: code}, true
}

func (f fakeCatalogue) Family(_ country.LabelKind, code string) string { return code }

// fivePool is a catalogue of AA to EE in the given regions; AA's flag looks like every other.
func fivePool(regions ...string) fakeCatalogue {
	var cat fakeCatalogue
	for i, code := range []string{"AA", "BB", "CC", "DD", "EE"} {
		c := country.Country{
			Code:       code,
			Name:       country.Names{De: "N" + code, En: "N" + code},
			Capital:    country.Names{De: "C" + code, En: "C" + code},
			Region:     regions[i],
			Languages:  []string{"l" + code},
			Currencies: []string{"c" + code},
			Fame:       1,
			FlagKey:    "f" + code,
		}
		if code == "AA" {
			c.Lookalikes = []string{"BB", "CC", "DD", "EE"}
		}
		cat = append(cat, c)
	}
	return cat
}

// fiveCountries pins exhaustion, the fallback to another type and errPoolTooSmall on a literal pool.
func fiveCountries(t *testing.T) {
	others := map[string]bool{"BB": true, "CC": true, "DD": true, "EE": true}
	tests := []struct {
		name     string
		cat      fakeCatalogue
		used     map[string]bool
		wantType string
		wantErr  error
	}{
		{"every country used", fivePool("R1", "R2", "R3", "R4", "R5"), map[string]bool{"AA": true, "BB": true, "CC": true, "DD": true, "EE": true}, "", errQuizExhausted},
		{"look-alike flags fall back to name_region", fivePool("R1", "R2", "R3", "R4", "R5"), others, "name_region", nil},
		{"no type has three distractors", fivePool("R1", "R2", "R1", "R2", "R1"), others, "", errPoolTooSmall},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for seed := range uint64(20) {
				q, err := Generate(tt.cat, 0, tt.used, newRand(seed))
				if !errors.Is(err, tt.wantErr) || (err == nil && q.Type.ID() != tt.wantType) {
					t.Fatalf("seed %d: Generate = %+v, %v; want type %q, err %v", seed, q, err, tt.wantType, tt.wantErr)
				}
			}
		})
	}
}
