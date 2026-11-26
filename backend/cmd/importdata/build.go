package main

import (
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

const (
	wantUNMembers = 193
	wantPool      = 197
)

var (
	regions   = []string{"Africa", "Americas", "Asia", "Europe", "Oceania"}
	codeRe    = regexp.MustCompile(`^[A-Z]{2}$`)
	flagKeyRe = regexp.MustCompile(`^[0-9a-f]{10}$`)
)

// problems collects every violation, so one run lists them all.
type problems []string

func (p *problems) add(format string, args ...any) {
	*p = append(*p, fmt.Sprintf(format, args...))
}

// builder holds the inputs and the sorted pool while build merges them.
type builder struct {
	src    sources
	byCode map[string]mledozeCountry
	pool   []string
	p      problems
}

func (b *builder) inPool(code string) bool {
	_, ok := slices.BinarySearch(b.pool, code)
	return ok
}

// build merges the sources into the pool entries, sorted by code.
func build(src sources) ([]country.Country, []string) {
	b := &builder{src: src, byCode: make(map[string]mledozeCountry, len(src.mledoze))}
	for _, c := range src.mledoze {
		if _, dup := b.byCode[c.Code]; dup {
			b.p.add("mledoze: code %s occurs twice", c.Code)
		}
		b.byCode[c.Code] = c
	}
	b.pool = b.buildPool()
	names := b.countryNames()
	capitals := b.capitals()
	lookalikes := b.lookalikes()

	countries := make([]country.Country, 0, len(b.pool))
	for _, code := range b.pool {
		if _, ok := src.flags[code]; !ok {
			b.p.add("%s: no flag source in %s", code, flagSourceDir)
		}
		c := capitals[code]
		countries = append(countries, country.Country{
			Code:          code,
			Name:          names[code],
			Capital:       c.primary,
			OtherCapitals: c.others,
			Region:        b.byCode[code].Region,
			FlagKey:       country.FlagKey(code),
			Lookalikes:    append([]string{}, lookalikes[code]...),
		})
	}
	validate(countries, &b.p)
	return countries, b.p
}

// buildPool returns the sorted pool: UN members after the unMember overrides, plus poolAdditions.
func (b *builder) buildPool() []string {
	o := b.src.overrides
	unMember := map[string]bool{}
	for code, c := range b.byCode {
		unMember[code] = c.UNMember
	}
	for _, code := range slices.Sorted(maps.Keys(o.UNMember)) {
		ov := o.UNMember[code]
		requireReason(&b.p, "unMember "+code, ov.Reason)
		c, ok := b.byCode[code]
		switch {
		case !ok:
			b.p.add("unMember %s: not a mledoze code", code)
		case ov.Value == nil:
			b.p.add("unMember %s: no value", code)
		case *ov.Value == c.UNMember:
			b.p.add("unMember %s: equals the source value %t", code, c.UNMember)
		default:
			unMember[code] = *ov.Value
		}
	}

	var pool []string
	for code, member := range unMember {
		if member {
			pool = append(pool, code)
		}
	}
	if len(pool) != wantUNMembers {
		b.p.add("UN member count is %d, want %d", len(pool), wantUNMembers)
	}

	add := o.PoolAdditions
	requireReason(&b.p, "poolAdditions", add.Reason)
	for i, code := range add.Codes {
		_, known := b.byCode[code]
		switch {
		case !known:
			b.p.add("poolAdditions %s: not a mledoze code", code)
		case unMember[code]:
			b.p.add("poolAdditions %s: already a UN member", code)
		case slices.Contains(add.Codes[:i], code):
			b.p.add("poolAdditions %s: listed twice", code)
		default:
			pool = append(pool, code)
		}
	}
	slices.Sort(pool)
	if len(pool) != wantPool {
		b.p.add("pool count is %d, want %d", len(pool), wantPool)
	}
	return pool
}

// countryNames takes English from mledoze and German from CLDR, then applies countryNames.
func (b *builder) countryNames() map[string]country.Names {
	names := make(map[string]country.Names, len(b.pool))
	for _, code := range b.pool {
		names[code] = country.Names{De: b.src.germanNames[code], En: b.byCode[code].Name.Common}
	}
	ov := b.src.overrides.CountryNames
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		if !b.inPool(code) {
			b.p.add("countryNames %s: not a pool code", code)
			continue
		}
		names[code] = applyLabels(&b.p, "countryNames "+code, names[code], ov[code])
	}
	return names
}

type capitalSet struct {
	primary country.Names
	others  []country.Names
}

// capitals picks each pool entry's primary capital from its Wikidata rows and primaryCapitals.
func (b *builder) capitals() map[string]capitalSet {
	o := b.src.overrides
	qidsOf := map[string][]string{}
	label := map[string]country.Names{}
	for _, r := range b.src.capitals {
		if !b.inPool(r.Code) || r.QID == "" {
			continue
		}
		if slices.Contains(qidsOf[r.Code], r.QID) {
			b.p.add("%s: capital %s listed twice", r.Code, r.QID)
			continue
		}
		if prev, ok := label[r.QID]; ok && prev != r.Names {
			b.p.add("capital %s: labels differ between rows", r.QID)
		}
		qidsOf[r.Code] = append(qidsOf[r.Code], r.QID)
		label[r.QID] = r.Names
	}

	for _, qid := range slices.Sorted(maps.Keys(o.CapitalLabels)) {
		if _, ok := label[qid]; !ok {
			b.p.add("capitalLabels %s: not a capital of a pool code", qid)
			continue
		}
		label[qid] = applyLabels(&b.p, "capitalLabels "+qid, label[qid], o.CapitalLabels[qid])
	}

	for _, code := range slices.Sorted(maps.Keys(o.PrimaryCapitals)) {
		pc := o.PrimaryCapitals[code]
		requireReason(&b.p, "primaryCapitals "+code, pc.Reason)
		switch {
		case !b.inPool(code):
			b.p.add("primaryCapitals %s: not a pool code", code)
		case !slices.Contains(qidsOf[code], pc.QID):
			b.p.add("primaryCapitals %s: %s is not one of its capitals %v", code, pc.QID, qidsOf[code])
		case len(qidsOf[code]) == 1:
			b.p.add("primaryCapitals %s: equals the source value, its only capital %s", code, pc.QID)
		}
	}

	sets := make(map[string]capitalSet, len(b.pool))
	for _, code := range b.pool {
		qids := qidsOf[code]
		primary := ""
		switch {
		case len(qids) == 0:
			b.p.add("%s: no capital in %s", code, capitalsPath)
			continue
		case len(qids) == 1:
			primary = qids[0]
		default:
			primary = o.PrimaryCapitals[code].QID
			if !slices.Contains(qids, primary) {
				b.p.add("%s: capitals %v need a primaryCapitals entry naming one of them", code, qids)
				continue
			}
		}
		set := capitalSet{primary: label[primary], others: []country.Names{}}
		for _, qid := range qids {
			if qid != primary {
				set.others = append(set.others, label[qid])
			}
		}
		slices.SortFunc(set.others, func(x, y country.Names) int { return strings.Compare(x.En, y.En) })
		sets[code] = set
	}
	return sets
}

// lookalikes validates the curated pairs and returns each code's partners, sorted.
func (b *builder) lookalikes() map[string][]string {
	partners := map[string][]string{}
	seen := map[[2]string]bool{}
	for _, l := range b.src.overrides.Lookalikes {
		name := fmt.Sprintf("lookalikes %v", l.Pair)
		requireReason(&b.p, name, l.Reason)
		if len(l.Pair) != 2 {
			b.p.add("%s: a pair holds 2 codes", name)
			continue
		}
		x, y := l.Pair[0], l.Pair[1]
		switch {
		case !b.inPool(x) || !b.inPool(y):
			b.p.add("%s: not two pool codes", name)
		case x >= y:
			b.p.add("%s: codes must be distinct and ascending", name)
		case b.byCode[x].Region != b.byCode[y].Region:
			b.p.add("%s: regions %s and %s differ", name, b.byCode[x].Region, b.byCode[y].Region)
		case seen[[2]string{x, y}]:
			b.p.add("%s: listed twice", name)
		default:
			seen[[2]string{x, y}] = true
			partners[x] = append(partners[x], y)
			partners[y] = append(partners[y], x)
		}
	}
	for _, list := range partners {
		slices.Sort(list)
	}
	return partners
}

// applyLabels returns names with the override's languages replaced.
func applyLabels(p *problems, name string, names country.Names, ov labelOverride) country.Names {
	requireReason(p, name, ov.Reason)
	if ov.De == nil && ov.En == nil {
		p.add("%s: sets neither de nor en", name)
	}
	for _, f := range []struct {
		lang   string
		value  *string
		target *string
	}{{"de", ov.De, &names.De}, {"en", ov.En, &names.En}} {
		switch {
		case f.value == nil:
		case *f.value == "":
			p.add("%s: %s is empty", name, f.lang)
		case *f.value == *f.target:
			p.add("%s: %s equals the source value %q", name, f.lang, *f.value)
		default:
			*f.target = *f.value
		}
	}
	return names
}

func requireReason(p *problems, name, reason string) {
	if strings.TrimSpace(reason) == "" {
		p.add("%s: no reason", name)
	}
}

// validate checks every entry against the schema and the cross-entry invariants.
func validate(countries []country.Country, p *problems) {
	byCode := make(map[string]country.Country, len(countries))
	for _, c := range countries {
		byCode[c.Code] = c
	}
	type labelKey struct{ kind, label string }
	owner := map[labelKey]string{}
	for _, c := range countries {
		if !codeRe.MatchString(c.Code) {
			p.add("%s: code is not an upper-case alpha-2 code", c.Code)
		}
		for _, k := range []labelKey{
			{"country de", c.Name.De}, {"country en", c.Name.En},
			{"primary-capital de", c.Capital.De}, {"primary-capital en", c.Capital.En},
		} {
			if k.label == "" {
				p.add("%s: no %s label", c.Code, k.kind)
				continue
			}
			if prev, ok := owner[k]; ok {
				p.add("%s and %s share the %s label %q", prev, c.Code, k.kind, k.label)
			}
			owner[k] = c.Code
		}
		for _, other := range c.OtherCapitals {
			if other.De == "" || other.En == "" {
				p.add("%s: other capital %+v lacks a label", c.Code, other)
			}
		}
		if !slices.Contains(regions, c.Region) {
			p.add("%s: region %q is not one of %v", c.Code, c.Region, regions)
		}
		if !flagKeyRe.MatchString(c.FlagKey) {
			p.add("%s: flag key %q is not 10 hex chars", c.Code, c.FlagKey)
		}
		if !slices.IsSorted(c.Lookalikes) {
			p.add("%s: lookalikes %v are not sorted", c.Code, c.Lookalikes)
		}
		for _, other := range c.Lookalikes {
			if !slices.Contains(byCode[other].Lookalikes, c.Code) {
				p.add("%s: lookalike %s does not list it back", c.Code, other)
			}
		}
	}
}
