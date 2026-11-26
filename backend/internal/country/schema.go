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
	FlagKey       string   `json:"flagKey"`
	Lookalikes    []string `json:"lookalikes"`
}

// FlagKey returns the key that names a country's flag file, from its upper-case alpha-2 code.
// The key hides the code from casual inspection only: anyone who knows the scheme reverses it.
func FlagKey(code string) string {
	sum := sha256.Sum256([]byte("wtf-flag:" + code))
	return hex.EncodeToString(sum[:])[:10]
}
