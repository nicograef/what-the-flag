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
	// AttrRegionalLanguage prompts with one of the target's regional languages, stored as Question.Prompt.
	AttrRegionalLanguage Attr = "regional_language"
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

// Types holds every question type; the tiers run from 1 to 9.
var Types = []QuestionType{
	{AttrFlag, AttrName, 1},
	{AttrName, AttrFlag, 1},
	{AttrName, AttrRegion, 1},
	{AttrName, AttrCapital, 2},
	{AttrCapital, AttrName, 2},
	{AttrFlag, AttrRegion, 2},
	{AttrName, AttrCurrency, 3},
	{AttrFlag, AttrCapital, 4},
	{AttrCapital, AttrFlag, 4},
	{AttrName, AttrLanguage, 4},
	{AttrCapital, AttrRegion, 3},
	{AttrFlag, AttrCurrency, 6},
	{AttrFlag, AttrLanguage, 8},
	{AttrCapital, AttrCurrency, 7},
	{AttrCapital, AttrLanguage, 8},
	{AttrRegionalLanguage, AttrName, 9},
}

// Question asks about Target, an alpha-2 code. Options are alpha-2 codes for a
// country-valued answer and attribute codes otherwise; Options[Correct] is the true one.
// Prompt is the language code a regional-language prompt shows, empty for every other prompt.
type Question struct {
	Type    QuestionType
	Target  string
	Prompt  string
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
	case AttrRegion, AttrLanguage, AttrCurrency, AttrRegionalLanguage:
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
	case AttrRegionalLanguage:
		return c.RegionalLanguages
	case AttrName, AttrFlag, AttrCapital:
	}
	return nil
}

// labelKind is the label kind of a value-valued attribute, empty for a country-valued one.
func labelKind(a Attr) country.LabelKind {
	switch a {
	case AttrRegion:
		return country.LabelRegion
	case AttrLanguage, AttrRegionalLanguage:
		return country.LabelLanguage
	case AttrCurrency:
		return country.LabelCurrency
	case AttrName, AttrFlag, AttrCapital:
	}
	return ""
}
