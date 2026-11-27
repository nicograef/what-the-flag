// Package quiz is the domain core: question generation, name rules, the run state machine
// and the service over its ports. It imports neither HTTP nor database code.
package quiz

import "github.com/nicograef/what-the-flag/internal/country"

// Attr is one attribute a question prompts with or asks for.
type Attr string

const (
	AttrName     Attr = "name"
	AttrFlag     Attr = "flag"
	AttrCapital  Attr = "capital"
	AttrRegion   Attr = "region"
	AttrLanguage Attr = "language"
	AttrCurrency Attr = "currency"
)

// identifiesCountry reports whether an answer of this attribute is a country, not an attribute code.
func (a Attr) identifiesCountry() bool {
	return a == AttrName || a == AttrFlag || a == AttrCapital
}

// QuestionType pairs a prompt attribute with an answer attribute; Tier 1 is the easiest.
type QuestionType struct {
	Prompt, Answer Attr
	Tier           int
}

// ID is the type's wire name, such as flag_capital.
func (t QuestionType) ID() string {
	return string(t.Prompt) + "_" + string(t.Answer)
}

// Types holds every question type.
var Types = []QuestionType{
	{AttrFlag, AttrName, 1},
	{AttrName, AttrFlag, 1},
	{AttrName, AttrRegion, 1},
	{AttrName, AttrCapital, 2},
	{AttrCapital, AttrName, 2},
	{AttrFlag, AttrRegion, 2},
	{AttrName, AttrCurrency, 2},
	{AttrFlag, AttrCapital, 3},
	{AttrCapital, AttrFlag, 3},
	{AttrName, AttrLanguage, 3},
	{AttrCapital, AttrRegion, 3},
	{AttrFlag, AttrCurrency, 4},
	{AttrFlag, AttrLanguage, 4},
	{AttrCapital, AttrCurrency, 4},
	{AttrCapital, AttrLanguage, 4},
}

// Question asks about Target, an alpha-2 code. Options are alpha-2 codes for a
// country-valued answer and attribute codes otherwise; Options[Correct] is the true one.
type Question struct {
	Type    QuestionType
	Target  string
	Options [4]string
	Correct int
}

// answerText is what a country option displays; a flag displays its flag key.
// A value-valued attribute has no country text.
func answerText(c *country.Country, a Attr) country.Names {
	switch a {
	case AttrName:
		return c.Name
	case AttrCapital:
		return c.Capital
	case AttrFlag:
		return country.Names{De: c.FlagKey, En: c.FlagKey}
	case AttrRegion, AttrLanguage, AttrCurrency:
	}
	return country.Names{}
}

// values returns the attribute codes a country has for a value-valued attribute, nil for a country-valued one.
func values(c *country.Country, a Attr) []string {
	switch a {
	case AttrRegion:
		return []string{c.Region}
	case AttrLanguage:
		return c.Languages
	case AttrCurrency:
		return c.Currencies
	case AttrName, AttrFlag, AttrCapital:
	}
	return nil
}

// labelKind is the label kind of a value-valued attribute, empty for a country-valued one.
func labelKind(a Attr) country.LabelKind {
	switch a {
	case AttrRegion:
		return country.LabelRegion
	case AttrLanguage:
		return country.LabelLanguage
	case AttrCurrency:
		return country.LabelCurrency
	case AttrName, AttrFlag, AttrCapital:
	}
	return ""
}
