package country

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
)

//go:embed dataset/countries.json
var dataset []byte

// LabelKind names the attribute a label code belongs to.
type LabelKind string

const (
	LabelLanguage LabelKind = "language"
	LabelCurrency LabelKind = "currency"
	LabelRegion   LabelKind = "region"
)

// Catalogue holds the country pool and its attribute labels in memory.
// Nothing mutates it after Load, and callers never mutate the nested slices, so concurrent reads are safe.
type Catalogue struct {
	pool   []Country
	labels Labels
}

// Load parses the embedded dataset, which the importer writes sorted by code.
func Load() (*Catalogue, error) {
	var file Dataset
	if err := json.Unmarshal(dataset, &file); err != nil {
		return nil, fmt.Errorf("parse country dataset: %w", err)
	}
	return &Catalogue{pool: file.Countries, labels: file.Labels}, nil
}

// Pool returns every pool country sorted by code, in a fresh outer slice.
func (c *Catalogue) Pool() []Country {
	return slices.Clone(c.pool)
}

// Label returns the names of an attribute code, such as a country's language, currency or region.
func (c *Catalogue) Label(kind LabelKind, code string) (Names, bool) {
	switch kind {
	case LabelLanguage:
		n, ok := c.labels.Languages[code]
		return n, ok
	case LabelCurrency:
		l, ok := c.labels.Currencies[code]
		return l.Names, ok
	case LabelRegion:
		n, ok := c.labels.Regions[code]
		return n, ok
	}
	return Names{}, false
}

// CurrencyFamily returns the family of an ISO 4217 code, or "" for a code the pool does not use.
func (c *Catalogue) CurrencyFamily(code string) string {
	return c.labels.Currencies[code].Family
}
