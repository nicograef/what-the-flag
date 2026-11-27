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
	const runs, shards = 2000, 8
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
	for i := range cat.pool {
		byCode[cat.pool[i].Code] = &cat.pool[i]
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
			if !errors.Is(err, ErrQuizExhausted) {
				t.Fatalf("seed %d position %d: err %v, want ErrQuizExhausted", seed, position, err)
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
		own := []string{q.Target}
		// blocked holds values the target lacks that a player could still defend; no option may carry one.
		var blocked []string
		if !q.Type.Answer.identifiesCountry() {
			own = values(target, q.Type.Answer)
			if q.Type.Answer == AttrRegion {
				blocked = append(blocked, target.OtherRegions...)
			}
			if q.Type.Prompt == AttrFlag {
				for _, code := range target.Lookalikes {
					blocked = append(blocked, values(byCode[code], q.Type.Answer)...)
				}
			}
		}
		flagCountries := (q.Type.Prompt == AttrFlag || q.Type.Answer == AttrFlag) && q.Type.Answer.identifiesCountry()
		des, ens := map[string]bool{}, map[string]bool{}
		for i, o := range q.Options {
			if (i == q.Correct) != slices.Contains(own, o) {
				fail("option %d %q: correct %t, true for the target %t", i, o, i == q.Correct, slices.Contains(own, o))
			}
			if i != q.Correct && slices.Contains(blocked, o) {
				fail("option %d %q is another region of the target or belongs to its look-alike", i, o)
			}
			l := text(q.Type, o)
			if l.De == "" || l.En == "" || des[l.De] || ens[l.En] {
				fail("option %d text %+v is empty or repeats", i, l)
			}
			des[l.De], ens[l.En] = true, true
			if flagCountries {
				for _, other := range q.Options {
					if slices.Contains(byCode[o].Lookalikes, other) {
						fail("look-alikes %s and %s", o, other)
					}
				}
			}
		}
	}
}

// fakeCatalogue is a literal pool whose labels are their codes.
type fakeCatalogue []country.Country

func (f fakeCatalogue) Pool() []country.Country { return slices.Clone(f) }

func (f fakeCatalogue) Label(_ country.LabelKind, code string) (country.Names, bool) {
	return country.Names{De: code, En: code}, true
}

// fiveCountries pins exhaustion, the fallback to another type and ErrPoolTooSmall on a literal pool.
func fiveCountries(t *testing.T) {
	five := func(regions ...string) fakeCatalogue {
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
	others := map[string]bool{"BB": true, "CC": true, "DD": true, "EE": true}
	tests := []struct {
		name     string
		cat      fakeCatalogue
		used     map[string]bool
		wantType string
		wantErr  error
	}{
		{"every country used", five("R1", "R2", "R3", "R4", "R5"), map[string]bool{"AA": true, "BB": true, "CC": true, "DD": true, "EE": true}, "", ErrQuizExhausted},
		{"look-alike flags fall back to name_region", five("R1", "R2", "R3", "R4", "R5"), others, "name_region", nil},
		{"no type has three distractors", five("R1", "R2", "R1", "R2", "R1"), others, "", ErrPoolTooSmall},
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
