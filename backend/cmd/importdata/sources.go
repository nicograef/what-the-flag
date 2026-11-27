package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"path"
	"slices"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

// Repo-relative paths of the importer's inputs.
const (
	mledozePath      = "data/sources/mledoze-countries/countries.json"
	cldrDir          = "data/sources/cldr"
	cldrAliasesPath  = "data/sources/cldr/supplemental/aliases.json"
	capitalsPath     = "data/sources/wikidata/capitals.csv"
	flagSourceDir    = "data/sources/flag-icons/4x3"
	flagLicensePath  = "data/sources/flag-icons/LICENSE"
	dataLicensePath  = "data/LICENSE"
	overridesPath    = "data/overrides.json"
	capitalsHeader   = "iso2,capital,capitalEn,capitalDe"
	cldrAltKeyMarker = "-alt-"
)

// sources holds every input the build reads, keyed by upper-case alpha-2 code where keyed.
type sources struct {
	mledoze     []mledozeCountry
	germanNames map[string]string
	// languageNames and currencyNames are keyed by CLDR language and ISO 4217 code.
	// A code CLDR names in one language only has an empty field.
	languageNames   map[string]country.Names
	currencyNames   map[string]country.Names
	languageAliases map[string]string
	capitals        []capitalRow
	flags           map[string][]byte
	overrides       overrides
	dataLicense     []byte
	flagLicense     []byte
}

type mledozeCountry struct {
	Code string `json:"cca2"`
	Name struct {
		Common string `json:"common"`
	} `json:"name"`
	UNMember   bool    `json:"unMember"`
	Region     string  `json:"region"`
	Languages  keySet  `json:"languages"`
	Currencies keySet  `json:"currencies"`
	Area       float64 `json:"area"`
}

// keySet reads a mledoze object as its sorted keys; mledoze writes an empty one as [].
type keySet []string

func (k *keySet) UnmarshalJSON(raw []byte) error {
	var empty []json.RawMessage
	if err := json.Unmarshal(raw, &empty); err == nil {
		if len(empty) > 0 {
			return fmt.Errorf("want an object or [], got %s", raw)
		}
		*k = nil
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return err
	}
	*k = slices.Sorted(maps.Keys(m))
	return nil
}

// capitalRow is one Wikidata CSV row; QID is empty for a country without a capital.
type capitalRow struct {
	Code  string
	QID   string
	Names country.Names
}

type overrides struct {
	UNMember        map[string]unMemberOverride `json:"unMember"`
	PoolAdditions   poolAdditions               `json:"poolAdditions"`
	PrimaryCapitals map[string]primaryCapital   `json:"primaryCapitals"`
	CapitalLabels   map[string]labelOverride    `json:"capitalLabels"`
	CountryNames    map[string]labelOverride    `json:"countryNames"`
	Lookalikes      []lookalike                 `json:"lookalikes"`
	OtherRegions    map[string]otherRegions     `json:"otherRegions"`
	FameTiers       map[string]fameTier         `json:"fameTiers"`
	Languages       map[string]listOverride     `json:"languages"`
	Currencies      map[string]listOverride     `json:"currencies"`
}

type fameTier struct {
	Tier   int    `json:"tier"`
	Reason string `json:"reason"`
}

// listOverride edits one country's code list: Remove names codes after the source mapping.
type listOverride struct {
	Add    []string `json:"add"`
	Remove []string `json:"remove"`
	Reason string   `json:"reason"`
}

type unMemberOverride struct {
	Value  *bool  `json:"value"`
	Reason string `json:"reason"`
}

type poolAdditions struct {
	Codes  []string `json:"codes"`
	Reason string   `json:"reason"`
}

type primaryCapital struct {
	QID    string `json:"qid"`
	Reason string `json:"reason"`
}

// labelOverride replaces a source label per language; a nil field keeps the source's.
type labelOverride struct {
	De     *string `json:"de"`
	En     *string `json:"en"`
	Reason string  `json:"reason"`
}

type lookalike struct {
	Pair   []string `json:"pair"`
	Reason string   `json:"reason"`
}

type otherRegions struct {
	Regions []string `json:"regions"`
	Reason  string   `json:"reason"`
}

func readSources(root *os.Root) (sources, error) {
	var src sources
	var err error
	if src.mledoze, err = readMledoze(root); err != nil {
		return sources{}, err
	}
	if err := readCLDR(root, &src); err != nil {
		return sources{}, err
	}
	if src.capitals, err = readCapitals(root); err != nil {
		return sources{}, err
	}
	if src.flags, err = readFlags(root); err != nil {
		return sources{}, err
	}
	if src.overrides, err = readOverrides(root); err != nil {
		return sources{}, err
	}
	if src.dataLicense, err = root.ReadFile(dataLicensePath); err != nil {
		return sources{}, err
	}
	if src.flagLicense, err = root.ReadFile(flagLicensePath); err != nil {
		return sources{}, err
	}
	return src, nil
}

func readMledoze(root *os.Root) ([]mledozeCountry, error) {
	raw, err := root.ReadFile(mledozePath)
	if err != nil {
		return nil, err
	}
	var countries []mledozeCountry
	if err := json.Unmarshal(raw, &countries); err != nil {
		return nil, fmt.Errorf("%s: %w", mledozePath, err)
	}
	return countries, nil
}

// cldrLocale holds the parts of one locale's CLDR files the importer reads.
type cldrLocale struct {
	LocaleDisplayNames struct {
		Territories map[string]string `json:"territories"`
		Languages   map[string]string `json:"languages"`
	} `json:"localeDisplayNames"`
	Numbers struct {
		Currencies map[string]struct {
			DisplayName string `json:"displayName"`
		} `json:"currencies"`
	} `json:"numbers"`
}

func readCLDRLocale(root *os.Root, lang, file string) (cldrLocale, error) {
	p := path.Join(cldrDir, lang, file)
	raw, err := root.ReadFile(p)
	if err != nil {
		return cldrLocale{}, err
	}
	var doc struct {
		Main map[string]cldrLocale `json:"main"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return cldrLocale{}, fmt.Errorf("%s: %w", p, err)
	}
	loc, ok := doc.Main[lang]
	if !ok {
		return cldrLocale{}, fmt.Errorf("%s: no main.%s", p, lang)
	}
	return loc, nil
}

// readCLDR fills the German territory names, the language and currency names, and the language aliases.
// Keys with -alt- are variants and are not read.
func readCLDR(root *os.Root, src *sources) error {
	territories, err := readCLDRLocale(root, "de", "territories.json")
	if err != nil {
		return err
	}
	src.germanNames = map[string]string{}
	for key, name := range territories.LocaleDisplayNames.Territories {
		if !strings.Contains(key, cldrAltKeyMarker) {
			src.germanNames[key] = name
		}
	}

	src.languageNames = map[string]country.Names{}
	src.currencyNames = map[string]country.Names{}
	for _, lang := range []string{"de", "en"} {
		languages, err := readCLDRLocale(root, lang, "languages.json")
		if err != nil {
			return err
		}
		for key, name := range languages.LocaleDisplayNames.Languages {
			if !strings.Contains(key, cldrAltKeyMarker) {
				setLabel(src.languageNames, key, lang, name)
			}
		}
		currencies, err := readCLDRLocale(root, lang, "currencies.json")
		if err != nil {
			return err
		}
		for key, c := range currencies.Numbers.Currencies {
			setLabel(src.currencyNames, key, lang, c.DisplayName)
		}
	}

	raw, err := root.ReadFile(cldrAliasesPath)
	if err != nil {
		return err
	}
	var aliases struct {
		Supplemental struct {
			Metadata struct {
				Alias struct {
					LanguageAlias map[string]struct {
						Replacement string `json:"_replacement"`
					} `json:"languageAlias"`
				} `json:"alias"`
			} `json:"metadata"`
		} `json:"supplemental"`
	}
	if err := json.Unmarshal(raw, &aliases); err != nil {
		return fmt.Errorf("%s: %w", cldrAliasesPath, err)
	}
	src.languageAliases = map[string]string{}
	for code, a := range aliases.Supplemental.Metadata.Alias.LanguageAlias {
		src.languageAliases[code] = a.Replacement
	}
	return nil
}

func setLabel(labels map[string]country.Names, code, lang, name string) {
	n := labels[code]
	if lang == "de" {
		n.De = name
	} else {
		n.En = name
	}
	labels[code] = n
}

func readCapitals(root *os.Root) ([]capitalRow, error) {
	raw, err := root.ReadFile(capitalsPath)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = 4
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", capitalsPath, err)
	}
	if got := strings.Join(header, ","); got != capitalsHeader {
		return nil, fmt.Errorf("%s: header is %q, want %q", capitalsPath, got, capitalsHeader)
	}
	var rows []capitalRow
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			return rows, nil
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", capitalsPath, err)
		}
		rows = append(rows, capitalRow{
			Code:  rec[0],
			QID:   rec[1][strings.LastIndex(rec[1], "/")+1:],
			Names: country.Names{En: rec[2], De: rec[3]},
		})
	}
}

// readFlags returns every flag source, keyed by the upper-case code its file name carries.
func readFlags(root *os.Root) (map[string][]byte, error) {
	entries, err := fs.ReadDir(root.FS(), flagSourceDir)
	if err != nil {
		return nil, err
	}
	flags := map[string][]byte{}
	for _, e := range entries {
		code, ok := strings.CutSuffix(e.Name(), ".svg")
		if !ok || e.IsDir() {
			continue
		}
		svg, err := root.ReadFile(path.Join(flagSourceDir, e.Name()))
		if err != nil {
			return nil, err
		}
		flags[strings.ToUpper(code)] = svg
	}
	return flags, nil
}

func readOverrides(root *os.Root) (overrides, error) {
	raw, err := root.ReadFile(overridesPath)
	if err != nil {
		return overrides{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var o overrides
	if err := dec.Decode(&o); err != nil {
		return overrides{}, fmt.Errorf("%s: %w", overridesPath, err)
	}
	return o, nil
}
