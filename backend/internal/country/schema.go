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
	Code          string   `json:"code"`
	Name          Names    `json:"name"`
	Capital       Names    `json:"capital"`
	OtherCapitals []Names  `json:"otherCapitals"`
	Region        string   `json:"region"`
	OtherRegions  []string `json:"otherRegions"` // regions the country also spans, never a wrong option for it
	Languages     []string `json:"languages"`
	Currencies    []string `json:"currencies"`
	Fame          int      `json:"fame"`
	FlagKey       string   `json:"flagKey"`
	Lookalikes    []string `json:"lookalikes"`
}

// Labels names every attribute code the pool uses, per kind: CLDR language codes,
// ISO 4217 currency codes and regions.
type Labels struct {
	Languages  map[string]Names `json:"languages"`
	Currencies map[string]Names `json:"currencies"`
	Regions    map[string]Names `json:"regions"`
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
