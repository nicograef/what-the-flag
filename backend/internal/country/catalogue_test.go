package country

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"testing"
)

func TestPoolInvariants(t *testing.T) {
	cat, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	pool := cat.Pool()
	byCode := make(map[string]Country, len(pool))
	for _, c := range pool {
		byCode[c.Code] = c
	}
	regions := []string{"Africa", "Americas", "Asia", "Europe", "Oceania"}
	flagKeyRe := regexp.MustCompile(`^[0-9a-f]{10}$`)
	unique := func(t *testing.T, label func(Country) Names) {
		t.Helper()
		owner := map[string]string{}
		for _, c := range pool {
			l := label(c)
			for _, key := range []string{"de:" + l.De, "en:" + l.En} {
				if prev, ok := owner[key]; ok {
					t.Errorf("%s and %s share %q", prev, c.Code, key)
				}
				owner[key] = c.Code
			}
		}
	}

	tests := []struct {
		name  string
		check func(t *testing.T)
	}{
		{"pool count is 197", func(t *testing.T) {
			if len(pool) != 197 {
				t.Errorf("len(Pool()) = %d, want 197", len(pool))
			}
		}},
		{"every entry is complete", func(t *testing.T) {
			for _, c := range pool {
				if c.Name.De == "" || c.Name.En == "" || c.Capital.De == "" || c.Capital.En == "" {
					t.Errorf("%s: name %+v or capital %+v lacks a label", c.Code, c.Name, c.Capital)
				}
				if !slices.Contains(regions, c.Region) {
					t.Errorf("%s: region %q is not one of %v", c.Code, c.Region, regions)
				}
				if !flagKeyRe.MatchString(c.FlagKey) || c.FlagKey != FlagKey(c.Code) {
					t.Errorf("%s: flag key %q, want %q", c.Code, c.FlagKey, FlagKey(c.Code))
				}
			}
		}},
		{"every entry has languages, currencies and a fame tier", func(t *testing.T) {
			for _, c := range pool {
				if len(c.Languages) == 0 || len(c.Currencies) == 0 || c.Fame < 1 || c.Fame > 3 {
					t.Errorf("%s: languages %v, currencies %v, fame %d", c.Code, c.Languages, c.Currencies, c.Fame)
				}
			}
		}},
		{"every attribute code has both labels", func(t *testing.T) {
			for _, c := range pool {
				codes := map[LabelKind][]string{LabelLanguage: c.Languages, LabelCurrency: c.Currencies, LabelRegion: {c.Region}}
				for kind, list := range codes {
					for _, code := range list {
						if n, ok := cat.Label(kind, code); !ok || n.De == "" || n.En == "" {
							t.Errorf("%s: %s %s has label %+v, %t", c.Code, kind, code, n, ok)
						}
					}
				}
			}
		}},
		{"CH has its four official languages and CHF", func(t *testing.T) {
			ch := byCode["CH"]
			if !slices.Equal(ch.Languages, []string{"de", "fr", "it", "rm"}) || !slices.Equal(ch.Currencies, []string{"CHF"}) {
				t.Errorf("CH languages %v, currencies %v; want [de fr it rm], [CHF]", ch.Languages, ch.Currencies)
			}
		}},
		{"no other capital is a primary capital", func(t *testing.T) {
			primary := map[string]string{}
			for _, c := range pool {
				primary["de:"+c.Capital.De] = c.Code
				primary["en:"+c.Capital.En] = c.Code
			}
			for _, c := range pool {
				for _, other := range c.OtherCapitals {
					for _, key := range []string{"de:" + other.De, "en:" + other.En} {
						if owner, ok := primary[key]; ok {
							t.Errorf("%s: other capital %q is the primary capital of %s", c.Code, key, owner)
						}
					}
				}
			}
		}},
		{"every entry has a flag file", func(t *testing.T) {
			for _, c := range pool {
				if _, err := os.Stat(filepath.Join("..", "..", "..", "frontend", "public", "flags", c.FlagKey+".svg")); err != nil {
					t.Errorf("%s: %v", c.Code, err)
				}
			}
		}},
		{"country labels are unique per language", func(t *testing.T) {
			unique(t, func(c Country) Names { return c.Name })
		}},
		{"primary-capital labels are unique per language", func(t *testing.T) {
			unique(t, func(c Country) Names { return c.Capital })
		}},
		{"look-alikes are symmetric same-region pool codes and include NI/SV", func(t *testing.T) {
			for _, c := range pool {
				for _, code := range c.Lookalikes {
					other, ok := byCode[code]
					switch {
					case !ok || code == c.Code:
						t.Errorf("%s: look-alike %s is not another pool code", c.Code, code)
					case other.Region != c.Region:
						t.Errorf("%s (%s): look-alike %s is in %s", c.Code, c.Region, code, other.Region)
					case !slices.Contains(other.Lookalikes, c.Code):
						t.Errorf("%s: look-alike %s does not list it back", c.Code, code)
					}
				}
			}
			if !slices.Contains(byCode["NI"].Lookalikes, "SV") {
				t.Errorf("NI look-alikes = %v, want SV among them", byCode["NI"].Lookalikes)
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, tt.check)
	}
}
