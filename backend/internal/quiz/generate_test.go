package quiz

import (
	"errors"
	"math/rand/v2"
	"slices"
	"strings"
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
	s := newSpace(realCatalogue(t))
	const runs, shards = 200, 8
	// The group returns once every parallel shard has finished.
	t.Run("runs", func(t *testing.T) {
		for shard := range uint64(shards) {
			t.Run("", func(t *testing.T) {
				t.Parallel()
				for seed := shard; seed < runs; seed += shards {
					checkRun(t, s, seed)
				}
			})
		}
	})
	t.Run("five-country catalogue", fiveCountries)
}

func TestLevel(t *testing.T) {
	// The play API accepts levels 1 to 10 only.
	for _, tt := range []struct{ position, want int }{{0, 1}, {4, 1}, {5, 2}, {44, 9}, {45, 10}, {500, 10}} {
		if got := Level(tt.position); got != tt.want {
			t.Errorf("Level(%d) = %d, want %d", tt.position, got, tt.want)
		}
	}
}

// levelTiers holds, per level from 1, the lowest and highest type tier of its window, extension included.
var levelTiers = [...][2]int{{1, 1}, {1, 2}, {1, 3}, {2, 4}, {3, 5}, {4, 6}, {4, 7}, {6, 8}, {7, 9}, {7, 10}}

// checkRun generates one run's questions from position 0 until the pool is exhausted and checks each
// against the question rules, its level's type window and fame ceiling, and the order of the candidate groups.
func checkRun(t *testing.T, s space, seed uint64) {
	t.Helper()
	pool := s.cat.pool
	regionSize := map[string]int{}
	for i := range pool {
		regionSize[pool[i].Region]++
	}
	rnd := newRand(seed)
	used := map[string]bool{}
	for position := 0; ; position++ {
		level := min(10, 1+position/5)
		ceiling := 3
		if level <= 2 {
			ceiling = 1
		} else if level <= 5 {
			ceiling = 2
		}
		famousLeft := slices.ContainsFunc(pool, func(c country.Country) bool { return !used[c.Code] && c.Fame <= ceiling })
		q, err := Generate(s.cat, position, used, rnd)
		if position == len(pool) {
			if !errors.Is(err, errQuizExhausted) {
				t.Fatalf("seed %d position %d: err %v, want errQuizExhausted", seed, position, err)
			}
			return
		}
		if err != nil {
			t.Fatalf("seed %d position %d: %v", seed, position, err)
		}
		fail := func(format string, args ...any) {
			t.Helper()
			t.Fatalf("seed %d position %d %+v: "+format, append([]any{seed, position, q}, args...)...)
		}
		target := s.byCode[q.Target]
		if used[q.Target] {
			fail("target repeats")
		}
		if tiers := levelTiers[level-1]; len(pool)-len(used) > 20 && (q.Type.Tier < tiers[0] || q.Type.Tier > tiers[1]) {
			fail("tier %d outside the level %d window %v", q.Type.Tier, level, tiers)
		}
		used[q.Target] = true
		if famousLeft && target.Fame > ceiling {
			fail("fame %d above the ceiling %d", target.Fame, ceiling)
		}
		if p := s.problems(q); len(p) > 0 {
			fail("%s", strings.Join(p, "; "))
		}
		if !q.Type.Answer.identifiesCountry() {
			continue
		}
		// group ranks a country as a distractor: the target's continent within the ceiling at levels 1 to 3,
		// the continent, then the rest, with continents under eight countries counted as the rest.
		small := regionSize[target.Region] < 8
		group := func(c *country.Country) int {
			switch {
			case small || c.Region != target.Region:
				return 2
			case level <= 3 && c.Fame <= ceiling:
				return 0
			}
			return 1
		}
		// A distractor may come from a later group only when every country of an earlier one
		// is an option, is defensible or clashes with an option.
		def := s.defensible(Case{Type: q.Type, Target: q.Target, Prompt: q.Prompt})
		flag := q.Type.Prompt == AttrFlag || q.Type.Answer == AttrFlag
		clashes := func(c *country.Country) bool {
			return def[c.Code] || slices.ContainsFunc(q.Options[:], func(o string) bool {
				l, ol := answerText(c, q.Type.Answer), s.text(q.Type.Answer, o)
				return l.De == ol.De || l.En == ol.En || (flag && slices.Contains(s.byCode[o].Lookalikes, c.Code))
			})
		}
		for i, o := range q.Options {
			if i == q.Correct {
				continue
			}
			og := group(s.byCode[o])
			for j := range pool {
				c := &pool[j]
				if cg := group(c); cg < og && !slices.Contains(q.Options[:], c.Code) && !clashes(c) {
					fail("option %s is in group %d, though %s of group %d fits", o, og, c.Code, cg)
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

// fiveCountries pins exhaustion, the fallbacks and errPoolTooSmall on a literal pool.
func fiveCountries(t *testing.T) {
	others := map[string]bool{"BB": true, "CC": true, "DD": true, "EE": true}
	obscure := fivePool("R1", "R2", "R3", "R4", "R5")
	obscure[0].Fame = 3
	three := fivePool("R1", "R2", "R3", "R4", "R5")[:3]
	// AA's look-alikes must stay inside the pool, as the importer guarantees; DD and EE are cut off.
	three[0].Lookalikes = []string{"BB", "CC"}
	tests := []struct {
		name    string
		cat     fakeCatalogue
		used    map[string]bool
		want    func(Question) bool
		wantErr error
	}{
		{"every country used", fivePool("R1", "R2", "R3", "R4", "R5"), map[string]bool{"AA": true, "BB": true, "CC": true, "DD": true, "EE": true}, nil, errQuizExhausted},
		{"look-alike flags fall back to name_region", fivePool("R1", "R2", "R3", "R4", "R5"), others,
			func(q Question) bool { return q.Type.ID() == "name_region" }, nil},
		{"no target within the fame ceiling retries without it", obscure, others,
			func(q Question) bool { return q.Target == "AA" && q.Type.ID() == "name_region" }, nil},
		{"no window type fits, so any type does", fivePool("R1", "R2", "R1", "R2", "R1"), others,
			func(q Question) bool { return q.Type.Tier > 1 }, nil},
		{"no type has three distractors", three, map[string]bool{"BB": true, "CC": true}, nil, errPoolTooSmall},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for seed := range uint64(20) {
				q, err := Generate(tt.cat, 0, tt.used, newRand(seed))
				if !errors.Is(err, tt.wantErr) || (err == nil && !tt.want(q)) {
					t.Fatalf("seed %d: Generate = %+v, %v; want err %v", seed, q, err, tt.wantErr)
				}
			}
		})
	}
}
