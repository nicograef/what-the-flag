package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

// Repo-relative paths of the importer's inputs.
const (
	mledozePath      = "data/sources/mledoze-countries/countries.json"
	cldrPath         = "data/sources/cldr/de/territories.json"
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
	capitals    []capitalRow
	flags       map[string][]byte
	overrides   overrides
	dataLicense []byte
	flagLicense []byte
}

type mledozeCountry struct {
	Code string `json:"cca2"`
	Name struct {
		Common string `json:"common"`
	} `json:"name"`
	UNMember bool   `json:"unMember"`
	Region   string `json:"region"`
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

func readSources(root *os.Root) (sources, error) {
	var src sources
	var err error
	if src.mledoze, err = readMledoze(root); err != nil {
		return sources{}, err
	}
	if src.germanNames, err = readCLDR(root); err != nil {
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

// readCLDR returns the German territory names; -alt- variants are not read.
func readCLDR(root *os.Root) (map[string]string, error) {
	raw, err := root.ReadFile(cldrPath)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Main struct {
			De struct {
				LocaleDisplayNames struct {
					Territories map[string]string `json:"territories"`
				} `json:"localeDisplayNames"`
			} `json:"de"`
		} `json:"main"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("%s: %w", cldrPath, err)
	}
	names := map[string]string{}
	for key, name := range doc.Main.De.LocaleDisplayNames.Territories {
		if !strings.Contains(key, cldrAltKeyMarker) {
			names[key] = name
		}
	}
	return names, nil
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
