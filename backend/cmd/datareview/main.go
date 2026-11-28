// Command datareview prints the review dump: one fixed-seed question per case of the question space, as Markdown.
//
// Exit codes: 0 done, 1 the catalogue does not load or the output fails.
package main

import (
	"bufio"
	"fmt"
	"io"
	"math/rand/v2"
	"os"

	"github.com/nicograef/what-the-flag/internal/country"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// seed fixes each case's question, so two dumps of one catalogue are equal.
const seed = 1

func main() {
	cat, err := country.Load()
	if err == nil {
		err = dump(os.Stdout, cat)
	}
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// dump writes a heading `## <typeId> <target> [<prompt>]` per case, then its prompt and options with the correct one ticked.
func dump(out io.Writer, cat *country.Catalogue) error {
	pool := cat.Pool()
	byCode := make(map[string]*country.Country, len(pool))
	for i := range pool {
		byCode[pool[i].Code] = &pool[i]
	}
	w := bufio.NewWriter(out)
	for _, c := range quiz.Cases(cat) {
		heading := "## " + c.Type.ID() + " " + c.Target
		if c.Prompt != "" {
			heading += " [" + c.Prompt + "]"
		}
		_, _ = fmt.Fprintf(w, "%s\n\n", heading)
		q, ok := quiz.Draw(cat, c, 1, rand.New(rand.NewPCG(seed, seed))) //nolint:gosec // G404: a fixed seed, no secret depends on it.
		if !ok {
			_, _ = fmt.Fprint(w, "No question: fewer than three wrong options fit.\n\n")
			continue
		}
		prompt := text(cat, byCode, c.Type.Prompt, c.Target)
		if c.Type.Prompt == quiz.AttrRegionalLanguage {
			prompt = label(cat, country.LabelLanguage, c.Prompt)
		}
		_, _ = fmt.Fprintf(w, "Prompt: %s\n\n", prompt)
		for i, o := range q.Options {
			mark := " "
			if i == q.Correct {
				mark = "x"
			}
			_, _ = fmt.Fprintf(w, "- [%s] %s\n", mark, text(cat, byCode, c.Type.Answer, o))
		}
		_, _ = fmt.Fprintln(w)
	}
	return w.Flush()
}

// text renders a country code under a country-valued attribute, or an attribute code under a value-valued one.
func text(cat *country.Catalogue, byCode map[string]*country.Country, a quiz.Attr, code string) string {
	c := byCode[code]
	switch a {
	case quiz.AttrName:
		if c != nil {
			return names(c.Name)
		}
	case quiz.AttrCapital:
		if c != nil {
			return names(c.Capital)
		}
	case quiz.AttrFlag:
		if c != nil {
			return "flag of " + names(c.Name)
		}
	case quiz.AttrRegion:
		return label(cat, country.LabelRegion, code)
	case quiz.AttrLanguage, quiz.AttrRegionalLanguage:
		return label(cat, country.LabelLanguage, code)
	case quiz.AttrCurrency:
		return label(cat, country.LabelCurrency, code)
	}
	return "unknown " + string(a) + " " + code
}

func label(cat *country.Catalogue, kind country.LabelKind, code string) string {
	n, ok := cat.Label(kind, code)
	if !ok {
		return "unlabelled " + string(kind) + " " + code
	}
	return names(n)
}

func names(n country.Names) string { return n.De + " / " + n.En }
