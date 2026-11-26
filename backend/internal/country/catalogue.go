package country

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
)

//go:embed dataset/countries.json
var dataset []byte

// Catalogue holds the country pool in memory.
// Callers never mutate the nested slices, so concurrent reads are safe.
type Catalogue struct {
	pool []Country
}

// Load parses the embedded dataset, which the importer writes sorted by code.
func Load() (*Catalogue, error) {
	var file struct {
		Countries []Country `json:"countries"`
	}
	if err := json.Unmarshal(dataset, &file); err != nil {
		return nil, fmt.Errorf("parse country dataset: %w", err)
	}
	return &Catalogue{pool: file.Countries}, nil
}

// Pool returns every pool country sorted by code, in a fresh outer slice.
func (c *Catalogue) Pool() []Country {
	return slices.Clone(c.pool)
}
