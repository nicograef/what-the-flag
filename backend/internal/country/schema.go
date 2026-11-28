// Package country describes the pool of countries the game asks about.
package country

import (
	"crypto/sha256"
	"encoding/hex"
)

// Names holds one label in both UI languages; the frontend picks the reader's.
type Names struct {
	De string `json:"de"`
	En string `json:"en"`
}

// Country is one pool entry of dataset/countries.json, its fields in file order.
type Country struct {
	Code              string   `json:"code"`
	Name              Names    `json:"name"`
	Capital           Names    `json:"capital"`
	Region            string   `json:"region"`
	Subregion         string   `json:"subregion"`         // mledoze's subregion within Region, such as Western Europe
	OtherRegions      []string `json:"otherRegions"`      // regions the country is also counted in, never a wrong option for it
	Languages         []string `json:"languages"`         // official at national level, or the de facto national language
	RegionalLanguages []string `json:"regionalLanguages"` // regional, minority, creole or indigenous languages established here and not official
	BlockedLanguages  []string `json:"blockedLanguages"`  // languages with a lesser status or a community here, never asked about it nor a wrong option for it
	Currencies        []string `json:"currencies"`
	Fame              int      `json:"fame"`
	FlagKey           string   `json:"flagKey"`
	Lookalikes        []string `json:"lookalikes"`
}

// Labels names every attribute code the pool uses, per kind: CLDR language codes,
// official and regional ones alike, ISO 4217 currency codes and regions.
type Labels struct {
	Languages  map[string]LanguageLabel `json:"languages"`
	Currencies map[string]CurrencyLabel `json:"currencies"`
	Regions    map[string]Names         `json:"regions"`
}

// LanguageLabel names a language and its family, empty for most.
// A family groups standard varieties of one language, such as Hindi and Urdu.
type LanguageLabel struct {
	Names
	Family string `json:"family,omitempty"`
}

// CurrencyLabel names a currency by its unit without the country, such as Peso, and its family.
// A family groups units a player could mistake for one another, such as Rupee and Rupiah.
type CurrencyLabel struct {
	Names
	Family string `json:"family"`
}

// Dataset is the shape of dataset/countries.json.
type Dataset struct {
	Countries []Country `json:"countries"`
	Labels    Labels    `json:"labels"`
}

// FlagKey returns the key that names a country's flag file, from its upper-case alpha-2 code.
// The key hides the code from casual inspection only: anyone who knows the scheme reverses it.
func FlagKey(code string) string {
	sum := sha256.Sum256([]byte("wtf-flag:" + code))
	return hex.EncodeToString(sum[:])[:10]
}
