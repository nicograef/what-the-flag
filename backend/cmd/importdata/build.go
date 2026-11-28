package main

import (
	"cmp"
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
	// Fame tiers by area rank in the pool, largest first: ranks up to tier1MaxRank are tier 1.
	tier1MaxRank = 50
	tier2MaxRank = 120
	// maxSpokenIn caps the countries a regional language is spoken in, so a question has three countries without it.
	maxSpokenIn = 5
)

var (
	// regionLabels holds mledoze's regions, which the PRD calls continents.
	regionLabels = map[string]country.Names{
		"Africa":   {De: "Afrika", En: "Africa"},
		"Americas": {De: "Amerika", En: "Americas"},
		"Asia":     {De: "Asien", En: "Asia"},
		"Europe":   {De: "Europa", En: "Europe"},
		"Oceania":  {De: "Ozeanien", En: "Oceania"},
	}
	regionalKinds = []string{"creole", "indigenous", "minority", "regional"}
	codeRe        = regexp.MustCompile(`^[A-Z]{2}$`)
	flagKeyRe     = regexp.MustCompile(`^[0-9a-f]{10}$`)
	// yearRangeRe matches the "(1964–2022)" CLDR appends to the name of a withdrawn code.
	yearRangeRe = regexp.MustCompile(`\(\d{4}\s*[–—-]\s*\d{4}\)`)
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

// build merges the sources into the pool entries, sorted by code, and the labels of their attribute codes.
func build(src sources) (country.Dataset, []string) {
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
	otherRegions := b.otherRegions()
	languages := b.codeLists("languages", b.src.overrides.Languages, func(c mledozeCountry) []string {
		var codes []string
		for _, code := range c.Languages {
			if alias, ok := src.languageAliases[code]; ok {
				code = alias
			}
			codes = append(codes, code)
		}
		return codes
	})
	currencies := b.codeLists("currencies", b.src.overrides.Currencies, func(c mledozeCountry) []string {
		return slices.Clone(c.Currencies)
	})
	regional := b.regionalLanguages(languages)
	blocked := b.blockedLanguages(languages, regional)
	fame := b.fameTiers()

	countries := make([]country.Country, 0, len(b.pool))
	for _, code := range b.pool {
		if _, ok := src.flags[code]; !ok {
			b.p.add("%s: no flag source in %s", code, flagSourceDir)
		}
		c := capitals[code]
		countries = append(countries, country.Country{
			Code:              code,
			Name:              names[code],
			Capital:           c.primary,
			Region:            b.byCode[code].Region,
			OtherRegions:      append([]string{}, otherRegions[code]...),
			Languages:         languages[code],
			RegionalLanguages: append([]string{}, regional[code]...),
			BlockedLanguages:  append([]string{}, blocked[code]...),
			Currencies:        currencies[code],
			Fame:              fame[code],
			FlagKey:           country.FlagKey(code),
			Lookalikes:        append([]string{}, lookalikes[code]...),
		})
	}
	labels := country.Labels{Languages: map[string]country.LanguageLabel{}, Currencies: map[string]country.CurrencyLabel{}, Regions: map[string]country.Names{}}
	languageLabel := func(owner, code string) {
		n := src.languageNames[code]
		if n.De == "" || n.En == "" {
			b.p.add("%s: language code %s lacks a German or English CLDR name %+v", owner, code, n)
		}
		if yearRangeRe.MatchString(n.De) || yearRangeRe.MatchString(n.En) {
			b.p.add("%s: language code %s is withdrawn, its CLDR name is %+v", owner, code, n)
		}
		labels.Languages[code] = country.LanguageLabel{Names: n}
	}
	for _, code := range slices.Sorted(maps.Keys(src.regional)) {
		languageLabel(regionalPath, code)
	}
	for _, c := range countries {
		for _, code := range c.Languages {
			languageLabel(c.Code, code)
		}
		for _, code := range c.Currencies {
			u, ok := src.currencyUnits[code]
			if !ok {
				b.p.add("%s: currency code %s has no entry in %s", c.Code, code, currencyUnitsPath)
			}
			labels.Currencies[code] = u
		}
		if n, ok := regionLabels[c.Region]; ok {
			labels.Regions[c.Region] = n
		}
	}
	b.languageLabels(labels.Languages)
	b.languageFamilies(labels.Languages)
	for _, code := range slices.Sorted(maps.Keys(src.currencyUnits)) {
		u := src.currencyUnits[code]
		if u.De == "" || u.En == "" || u.Family == "" {
			b.p.add("%s %s: de, en or family is empty in %+v", currencyUnitsPath, code, u)
		}
		if _, used := labels.Currencies[code]; !used {
			b.p.add("%s %s: no pool country uses it", currencyUnitsPath, code)
		}
	}
	ds := country.Dataset{Countries: countries, Labels: labels}
	validate(ds, &b.p)
	return ds, b.p
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
		set := capitalSet{primary: label[primary]}
		for _, qid := range qids {
			if qid != primary {
				set.others = append(set.others, label[qid])
			}
		}
		sets[code] = set
	}

	// A question about a primary capital must not have a second country's other capital as a true option.
	primaryOf := map[country.Names]string{}
	for code, set := range sets {
		primaryOf[country.Names{De: set.primary.De}] = code
		primaryOf[country.Names{En: set.primary.En}] = code
	}
	for _, code := range b.pool {
		for _, other := range sets[code].others {
			if other.De == "" || other.En == "" {
				b.p.add("%s: other capital %+v lacks a label", code, other)
				continue
			}
			for _, k := range []country.Names{{De: other.De}, {En: other.En}} {
				if owner, ok := primaryOf[k]; ok {
					b.p.add("%s: other capital %q is the primary capital of %s", code, k.De+k.En, owner)
				}
			}
		}
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

// otherRegions validates the curated second regions and returns each code's, sorted.
func (b *builder) otherRegions() map[string][]string {
	out := map[string][]string{}
	ov := b.src.overrides.OtherRegions
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		o, name := ov[code], "otherRegions "+code
		requireReason(&b.p, name, o.Reason)
		if !b.inPool(code) {
			b.p.add("%s: not a pool code", name)
			continue
		}
		if len(o.Regions) == 0 {
			b.p.add("%s: names no region", name)
		}
		for i, r := range o.Regions {
			switch {
			case regionLabels[r] == country.Names{}:
				b.p.add("%s: region %q is not one of %v", name, r, slices.Sorted(maps.Keys(regionLabels)))
			case r == b.byCode[code].Region:
				b.p.add("%s: %s equals the source region", name, r)
			case slices.Contains(o.Regions[:i], r):
				b.p.add("%s: %s listed twice", name, r)
			default:
				out[code] = append(out[code], r)
			}
		}
		slices.Sort(out[code])
	}
	return out
}

// codeLists returns each pool entry's sorted attribute codes: the source's, edited by the section's overrides.
func (b *builder) codeLists(section string, ov map[string]listOverride, source func(mledozeCountry) []string) map[string][]string {
	lists := make(map[string][]string, len(b.pool))
	for _, code := range b.pool {
		lists[code] = source(b.byCode[code])
	}
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		o, name := ov[code], section+" "+code
		requireReason(&b.p, name, o.Reason)
		if !b.inPool(code) {
			b.p.add("%s: not a pool code", name)
			continue
		}
		if len(o.Add) == 0 && len(o.Remove) == 0 {
			b.p.add("%s: adds and removes nothing", name)
		}
		list := lists[code]
		for _, r := range o.Remove {
			i := slices.Index(list, r)
			if i < 0 {
				b.p.add("%s: removes %s, which %v does not hold", name, r, list)
				continue
			}
			list = slices.Delete(list, i, i+1)
		}
		for _, a := range o.Add {
			if slices.Contains(list, a) {
				b.p.add("%s: adds %s, which %v already holds", name, a, list)
				continue
			}
			list = append(list, a)
		}
		lists[code] = list
	}
	for _, code := range b.pool {
		list := lists[code]
		slices.Sort(list)
		list = slices.Compact(list)
		if len(list) == 0 {
			b.p.add("%s: no %s", code, section)
		}
		if list == nil {
			list = []string{}
		}
		lists[code] = list
	}
	return lists
}

// regionalLanguages validates regional-languages.json and returns each pool code's regional languages, sorted.
// A language counts as spoken in every country of its spokenIn list and every country it is official in.
func (b *builder) regionalLanguages(official map[string][]string) map[string][]string {
	out := map[string][]string{}
	for _, lang := range slices.Sorted(maps.Keys(b.src.regional)) {
		r, name := b.src.regional[lang], regionalPath+" "+lang
		if !slices.Contains(regionalKinds, r.Kind) {
			b.p.add("%s: kind %q is not one of %v", name, r.Kind, regionalKinds)
		}
		if strings.TrimSpace(r.Source) == "" {
			b.p.add("%s: no source", name)
		}
		if len(r.SpokenIn) == 0 || len(r.SpokenIn) > maxSpokenIn {
			b.p.add("%s: spokenIn %v holds %d countries, want 1-%d", name, r.SpokenIn, len(r.SpokenIn), maxSpokenIn)
		}
		spoken := map[string]bool{}
		for i, code := range r.SpokenIn {
			switch {
			case !b.inPool(code):
				b.p.add("%s: spokenIn %s is not a pool code", name, code)
			case i > 0 && code <= r.SpokenIn[i-1]:
				b.p.add("%s: spokenIn %v is not distinct and ascending", name, r.SpokenIn)
			default:
				spoken[code] = true
			}
		}
		for _, code := range b.pool {
			if slices.Contains(official[code], lang) {
				spoken[code] = true
			}
		}
		if len(spoken) > maxSpokenIn {
			b.p.add("%s: spoken in %v with the countries it is official in, more than %d", name, slices.Sorted(maps.Keys(spoken)), maxSpokenIn)
		}
		for code := range spoken {
			out[code] = append(out[code], lang)
		}
	}
	for _, list := range out {
		slices.Sort(list)
	}
	return out
}

// blockedLanguages validates the curated blocked languages and returns each code's, sorted.
// A blocked language is official in another pool country, and neither official nor regional in its own.
func (b *builder) blockedLanguages(official, regional map[string][]string) map[string][]string {
	out := map[string][]string{}
	ov := b.src.overrides.BlockedLanguages
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		o, name := ov[code], "blockedLanguages "+code
		requireReason(&b.p, name, o.Reason)
		if !b.inPool(code) {
			b.p.add("%s: not a pool code", name)
			continue
		}
		if len(o.Languages) == 0 {
			b.p.add("%s: names no language", name)
		}
		for i, lang := range o.Languages {
			officialElsewhere := slices.ContainsFunc(b.pool, func(c string) bool { return c != code && slices.Contains(official[c], lang) })
			switch {
			case slices.Contains(o.Languages[:i], lang):
				b.p.add("%s: %s listed twice", name, lang)
			case slices.Contains(official[code], lang) || slices.Contains(regional[code], lang):
				b.p.add("%s: %s is already an official or regional language of it", name, lang)
			case !officialElsewhere:
				b.p.add("%s: %s is official in no other pool country, so it is never a wrong option", name, lang)
			default:
				out[code] = append(out[code], lang)
			}
		}
		slices.Sort(out[code])
	}
	return out
}

// languageLabels applies the languageLabels overrides to the CLDR names.
func (b *builder) languageLabels(labels map[string]country.LanguageLabel) {
	ov := b.src.overrides.LanguageLabels
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		l, ok := labels[code]
		if !ok {
			b.p.add("languageLabels %s: not a language of the dataset", code)
			continue
		}
		l.Names = applyLabels(&b.p, "languageLabels "+code, l.Names, ov[code])
		labels[code] = l
	}
}

// languageFamilies validates the curated language families and sets each member's family.
func (b *builder) languageFamilies(labels map[string]country.LanguageLabel) {
	ov := b.src.overrides.LanguageFamilies
	for _, family := range slices.Sorted(maps.Keys(ov)) {
		o, name := ov[family], "languageFamilies "+family
		requireReason(&b.p, name, o.Reason)
		if len(o.Languages) < 2 {
			b.p.add("%s: names %d languages, want at least 2", name, len(o.Languages))
		}
		for _, lang := range o.Languages {
			l, ok := labels[lang]
			switch {
			case !ok:
				b.p.add("%s: %s is not a language of the dataset", name, lang)
			case l.Family != "":
				b.p.add("%s: %s is already in family %s", name, lang, l.Family)
			default:
				l.Family = family
				labels[lang] = l
			}
		}
	}
}

// fameTiers ranks the pool by area, largest first, and applies the fameTiers overrides.
func (b *builder) fameTiers() map[string]int {
	ranked := slices.Clone(b.pool)
	// Stable on the code-sorted pool, so equal areas rank by code.
	slices.SortStableFunc(ranked, func(x, y string) int { return cmp.Compare(b.byCode[y].Area, b.byCode[x].Area) })
	tiers := make(map[string]int, len(ranked))
	rank := make(map[string]int, len(ranked))
	for i, code := range ranked {
		if b.byCode[code].Area <= 0 {
			b.p.add("%s: area %v is not positive", code, b.byCode[code].Area)
		}
		rank[code] = i + 1
		switch {
		case i+1 <= tier1MaxRank:
			tiers[code] = 1
		case i+1 <= tier2MaxRank:
			tiers[code] = 2
		default:
			tiers[code] = 3
		}
	}
	ov := b.src.overrides.FameTiers
	for _, code := range slices.Sorted(maps.Keys(ov)) {
		o, name := ov[code], "fameTiers "+code
		requireReason(&b.p, name, o.Reason)
		switch {
		case !b.inPool(code):
			b.p.add("%s: not a pool code", name)
		case o.Tier < 1 || o.Tier > 3:
			b.p.add("%s: tier %d is not 1-3", name, o.Tier)
		case o.Tier == tiers[code]:
			b.p.add("%s: equals tier %d from area rank %d", name, o.Tier, rank[code])
		default:
			tiers[code] = o.Tier
		}
	}
	return tiers
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
func validate(ds country.Dataset, p *problems) {
	countries := ds.Countries
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
		if _, ok := ds.Labels.Regions[c.Region]; !ok {
			p.add("%s: region %q is not one of %v", c.Code, c.Region, slices.Sorted(maps.Keys(regionLabels)))
		}
		if c.Fame < 1 || c.Fame > 3 {
			p.add("%s: fame %d is not 1-3", c.Code, c.Fame)
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
	// A language option named like a country reads as that country and gives it away.
	for _, code := range slices.Sorted(maps.Keys(ds.Labels.Languages)) {
		l := ds.Labels.Languages[code]
		for _, k := range []labelKey{{"country de", l.De}, {"country en", l.En}} {
			if holder, ok := owner[k]; ok {
				p.add("language %s: label %q is the country name of %s", code, k.label, holder)
			}
		}
	}
}
