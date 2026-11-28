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

// checkRun generates one run's questions from position 0 until the pool is exhausted
// and checks each against the question rules and the position's tier and fame.
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
		wantTier, wantFame := min(4, 1+position/5), min(3, 1+position/8)
		famousLeft := slices.ContainsFunc(pool, func(c country.Country) bool { return !used[c.Code] && c.Fame <= wantFame })
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
		used[q.Target] = true
		if q.Type.Tier > wantTier {
			fail("tier above %d", wantTier)
		}
		if famousLeft && target.Fame > wantFame {
			fail("fame %d above %d", target.Fame, wantFame)
		}
		if p := s.problems(q); len(p) > 0 {
			fail("%s", strings.Join(p, "; "))
		}
		// A distractor country may leave a region of eight or more only when every other country there
		// clashes with an option or is defensible.
		if !q.Type.Answer.identifiesCountry() || regionSize[target.Region] < 8 {
			continue
		}
		def := s.defensible(Case{Type: q.Type, Target: q.Target, Prompt: q.Prompt})
		flag := q.Type.Prompt == AttrFlag || q.Type.Answer == AttrFlag
		clashes := func(c *country.Country) bool {
			return def[c.Code] || slices.ContainsFunc(q.Options[:], func(o string) bool {
				l, ol := answerText(c, q.Type.Answer), s.text(q.Type.Answer, o)
				return l.De == ol.De || l.En == ol.En || (flag && slices.Contains(s.byCode[o].Lookalikes, c.Code))
			})
		}
		for _, o := range q.Options {
			if s.byCode[o].Region == target.Region {
				continue
			}
			for i := range pool {
				c := &pool[i]
				if c.Region == target.Region && !slices.Contains(q.Options[:], c.Code) && !clashes(c) {
					fail("option %s is outside %s, though %s fits", o, target.Region, c.Code)
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
