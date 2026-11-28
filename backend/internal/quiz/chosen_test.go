package quiz

import "testing"

func TestChosenCountry(t *testing.T) {
	// BB and DD share the continent R2; every currency belongs to one country.
	pool := fivePool("R1", "R2", "R3", "R2", "R5")
	question := func(id string, options ...string) Question {
		return Question{Type: typeOf(t, id), Target: "AA", Options: [4]string(options)}
	}
	tests := []struct {
		name   string
		q      Question
		chosen *int
		want   string
	}{
		{"country answer", question("flag_name", "AA", "BB", "CC", "DD"), new(2), "CC"},
		{"value one pool country holds", question("name_currency", "cAA", "cBB", "cCC", "cDD"), new(1), "BB"},
		{"value several pool countries hold", question("name_region", "R1", "R2", "R3", "R5"), new(1), ""},
		{"timeout", question("flag_name", "AA", "BB", "CC", "DD"), nil, ""},
		{"too-fast pick of the correct option", question("flag_name", "AA", "BB", "CC", "DD"), new(0), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ""
			if c := ChosenCountry(pool, tt.q, tt.chosen); c != nil {
				got = c.Code
			}
			if got != tt.want {
				t.Fatalf("ChosenCountry = %q, want %q", got, tt.want)
			}
		})
	}
}
