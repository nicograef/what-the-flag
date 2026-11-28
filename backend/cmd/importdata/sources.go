package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path"
	"slices"
	"strconv"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

// Repo-relative paths of the importer's inputs.
const (
	mledozePath       = "data/sources/mledoze-countries/countries.json"
	cldrDir           = "data/sources/cldr"
	cldrAliasesPath   = "data/sources/cldr/supplemental/aliases.json"
	territoryInfoPath = "data/sources/cldr/supplemental/territoryInfo.json"
	capitalsPath      = "data/sources/wikidata/capitals.csv"
	flagSourceDir     = "data/sources/flag-icons/4x3"
	flagLicensePath   = "data/sources/flag-icons/LICENSE"
	dataLicensePath   = "data/LICENSE"
	overridesPath     = "data/overrides.json"
	currencyUnitsPath = "data/currency-units.json"
	regionalPath      = "data/regional-languages.json"
	capitalsHeader    = "iso2,capital,capitalEn,capitalDe"
	articlesPath      = "data/sources/wikidata/articles.csv"
	articlesHeader    = "iso2,article"
	pageviewsPath     = "data/sources/wikimedia/pageviews.csv"
	pageviewsHeader   = "article,views"
	cldrAltKeyMarker  = "-alt-"
)

// sources holds every input the build reads, keyed by upper-case alpha-2 code where keyed.
type sources struct {
	mledoze     []mledozeCountry
	germanNames map[string]string
	// languageNames is keyed by CLDR language code; a code CLDR names in one language only has an empty field.
	languageNames   map[string]country.Names
	languageAliases map[string]string
	// territoryLanguages is keyed by CLDR territory code, then by language code without its script,
	// and holds the population percentage CLDR gives.
	territoryLanguages map[string]map[string]float64
	// currencyUnits is keyed by ISO 4217 code.
	currencyUnits map[string]country.CurrencyLabel
	// regional is keyed by CLDR language code.
	regional map[string]regionalLanguage
	capitals []capitalRow
	// articles maps a code to its German Wikipedia article; pageviews maps an article to its yearly user views.
	articles    map[string]string
	pageviews   map[string]int
	flags       map[string][]byte
	overrides   overrides
	dataLicense []byte
	flagLicense []byte
}

// regionalLanguage is one entry of regional-languages.json: a regional, minority, creole or indigenous language.
// SpokenIn names the countries where it is established and not official, BlockedIn those with a diaspora or a small community.
type regionalLanguage struct {
	SpokenIn  []string `json:"spokenIn"`
	BlockedIn []string `json:"blockedIn"`
	Source    string   `json:"source"`
}

type mledozeCountry struct {
	Code string `json:"cca2"`
	Name struct {
		Common string `json:"common"`
	} `json:"name"`
	UNMember   bool   `json:"unMember"`
	Region     string `json:"region"`
	Languages  keySet `json:"languages"`
	Currencies keySet `json:"currencies"`
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
	UNMember         map[string]unMemberOverride `json:"unMember"`
	PoolAdditions    poolAdditions               `json:"poolAdditions"`
	PrimaryCapitals  map[string]primaryCapital   `json:"primaryCapitals"`
	ExtraCapitals    map[string]extraCapital     `json:"extraCapitals"`
	CapitalLabels    map[string]labelOverride    `json:"capitalLabels"`
	CountryNames     map[string]labelOverride    `json:"countryNames"`
	NameExceptions   nameExceptions              `json:"nameExceptions"`
	Lookalikes       []lookalike                 `json:"lookalikes"`
	OtherRegions     map[string]otherRegions     `json:"otherRegions"`
	FameTiers        map[string]fameTier         `json:"fameTiers"`
	Languages        map[string]listOverride     `json:"languages"`
	LanguageLabels   map[string]labelOverride    `json:"languageLabels"`
	LanguageFamilies map[string]languageList     `json:"languageFamilies"`
	BlockedLanguages map[string]languageList     `json:"blockedLanguages"`
	Currencies       map[string]listOverride     `json:"currencies"`
}

// languageList names language codes: a family's members, or a country's blocked languages.
type languageList struct {
	Languages []string `json:"languages"`
	Reason    string   `json:"reason"`
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

// nameExceptions keeps the source's German country name (by code) or capital label (by QID)
// where the Auswärtiges Amt list uses a form German players do not know.
type nameExceptions struct {
	CountryNames  map[string]reasonOnly `json:"countryNames"`
	CapitalLabels map[string]reasonOnly `json:"capitalLabels"`
}

type reasonOnly struct {
	Reason string `json:"reason"`
}

// extraCapital adds a capital city that Wikidata does not list for a country.
type extraCapital struct {
	QID    string `json:"qid"`
	De     string `json:"de"`
	En     string `json:"en"`
	Reason string `json:"reason"`
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
	if src.articles, src.pageviews, err = readFame(root); err != nil {
		return sources{}, err
	}
	if src.flags, err = readFlags(root); err != nil {
		return sources{}, err
	}
	if err := readStrict(root, overridesPath, &src.overrides); err != nil {
		return sources{}, err
	}
	if err := readStrict(root, currencyUnitsPath, &src.currencyUnits); err != nil {
		return sources{}, err
	}
	if err := readStrict(root, regionalPath, &src.regional); err != nil {
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

// readCLDR fills the German territory names, the language names and the language aliases.
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

	if raw, err = root.ReadFile(territoryInfoPath); err != nil {
		return err
	}
	var info struct {
		Supplemental struct {
			TerritoryInfo map[string]struct {
				LanguagePopulation map[string]struct {
					PopulationPercent string `json:"_populationPercent"`
				} `json:"languagePopulation"`
			} `json:"territoryInfo"`
		} `json:"supplemental"`
	}
	if err := json.Unmarshal(raw, &info); err != nil {
		return fmt.Errorf("%s: %w", territoryInfoPath, err)
	}
	src.territoryLanguages = map[string]map[string]float64{}
	for territory, t := range info.Supplemental.TerritoryInfo {
		langs := map[string]float64{}
		for code, l := range t.LanguagePopulation {
			share, err := strconv.ParseFloat(l.PopulationPercent, 64)
			if err != nil {
				return fmt.Errorf("%s: %s %s: %w", territoryInfoPath, territory, code, err)
			}
			// CLDR splits some languages by script, as ff_Adlm and ff_Latn; the language keeps its largest share.
			base, _, _ := strings.Cut(code, "_")
			langs[base] = max(langs[base], share)
		}
		src.territoryLanguages[territory] = langs
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
	records, err := readCSV(root, capitalsPath, capitalsHeader)
	if err != nil {
		return nil, err
	}
	rows := make([]capitalRow, len(records))
	for i, rec := range records {
		rows[i] = capitalRow{
			Code:  rec[0],
			QID:   rec[1][strings.LastIndex(rec[1], "/")+1:],
			Names: country.Names{En: rec[2], De: rec[3]},
		}
	}
	return rows, nil
}

// readFame returns each code's German Wikipedia article and each article's view count.
func readFame(root *os.Root) (map[string]string, map[string]int, error) {
	records, err := readCSV(root, articlesPath, articlesHeader)
	if err != nil {
		return nil, nil, err
	}
	articles := map[string]string{}
	for _, rec := range records {
		if prev, dup := articles[rec[0]]; dup {
			return nil, nil, fmt.Errorf("%s: %s has two articles, %q and %q", articlesPath, rec[0], prev, rec[1])
		}
		articles[rec[0]] = rec[1]
	}
	if records, err = readCSV(root, pageviewsPath, pageviewsHeader); err != nil {
		return nil, nil, err
	}
	views := map[string]int{}
	for _, rec := range records {
		n, err := strconv.Atoi(rec[1])
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %q: %w", pageviewsPath, rec[0], err)
		}
		views[rec[0]] = n
	}
	return articles, views, nil
}

// readCSV returns a CSV file's records after checking its header.
func readCSV(root *os.Root, name, header string) ([][]string, error) {
	raw, err := root.ReadFile(name)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = strings.Count(header, ",") + 1
	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	if len(records) == 0 || strings.Join(records[0], ",") != header {
		return nil, fmt.Errorf("%s: the header is not %q", name, header)
	}
	return records[1:], nil
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

// readStrict decodes a curated JSON file into v and rejects unknown fields.
func readStrict(root *os.Root, name string, v any) error {
	raw, err := root.ReadFile(name)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	return nil
}
