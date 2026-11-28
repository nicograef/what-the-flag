package quiz

import (
	"slices"

	"github.com/nicograef/what-the-flag/internal/country"
)

// ChosenCountry returns the pool country of a missed question's picked option: the option itself for a country
// answer, else the one pool country whose list for the answer attribute holds the picked value. It returns nil for
// a timeout, for a pick of the correct option, which only a too-fast answer misses with, and for a value that no
// or several pool countries hold.
func ChosenCountry(pool []country.Country, q Question, chosen *int) *country.Country {
	if chosen == nil || *chosen == q.Correct {
		return nil
	}
	option := q.Options[*chosen]
	if q.Type.Answer.identifiesCountry() {
		return countryOf(pool, option)
	}
	var holder *country.Country
	for i := range pool {
		if slices.Contains(values(&pool[i], q.Type.Answer), option) {
			if holder != nil {
				return nil
			}
			holder = &pool[i]
		}
	}
	return holder
}
