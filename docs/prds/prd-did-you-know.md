# PRD: Did you know? (facts and phrases)

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screens: game over (06, 06b) and new record (07) in [docs/redesign/screens.md](../redesign/screens.md).

## Problem Statement

A miss ends the run, and the learning card explains the answer. Then the player leaves with a single fact they already half knew.
The game covers 197 countries, but it says nothing about them beyond the attribute it asks: no curiosity is sparked and nothing makes a country memorable.

## Solution

Under the learning card, the result shows one "Wusstest du?" card about the context of the missed question: its country, its capital or one of its languages, but never the answer it asked for.
It is one of two kinds, picked at random: a short fact with its source ("In Mali steht die Große Moschee von Djenné, das größte Lehmgebäude der Welt."), or five basic words in an official language of the country (hello, thank you, goodbye, yes, no).
The facts and words come from a curated, sourced data file checked in like the country data.

## User Stories

- As a player, I want a surprising fact about the country I just missed, so that I remember it next time.
- As a player, I want to learn how to say hello, thank you, goodbye, yes and no in that country's language, so that I take something useful away.
- As a player, I want to see where a fact comes from, so that I can trust it and read more.
- As a player, I want the fact not to repeat the answer I just saw, so that it adds something new.
- As a screen reader user, I want foreign words read in their language, so that I hear the right pronunciation.
- As the owner, I want every fact sourced and reviewed in the repository, so that the game never teaches something wrong.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| A curated file of facts and phrases, drafted from Wikipedia, Wikidata and Wiktionary, reviewed, imported like the country data | Medium (content work) | Content takes time; coverage grows over releases | High | **Yes** |
| Generate facts from Wikidata statements only (highest point, population, founding year) | Medium | Correct but dull; no phrases | High | No, but usable as a seed for the curated file |
| Fetch Wikipedia summaries at runtime | Low | Network at runtime, unchecked text, CC BY-SA text spread unreviewed; the PRD forbids runtime loading | Low | No |

### Data

- One curated data file of facts, one of phrases, beside the existing curated files, with their own licence note: Wikipedia and Wiktionary text is CC BY-SA 4.0, so these files are CC BY-SA 4.0, and NOTICE credits the sources. Wikidata-derived facts are CC0.
- A fact has: an id; its subject (a country code, plus optionally "capital" or a language code); the attribute it would reveal if any (capital, currency, language, continent, flag); German and English text of at most 140 characters; a source name and URL.
- A phrase set has: a language code; the five words hello, thank you, goodbye, yes and no, each with an optional Latin transliteration for non-Latin scripts; a source name and URL. A word with no plain equivalent (yes and no in some languages) may be left out; the card then shows four words.
- The importer validates both files and fails the gate on a missing language, a missing source, an over-long text, an unknown subject or a duplicate id.
- Coverage goal for the first release: at least one fact for each of the 197 countries and phrases for the most spoken official language of each. The card is hidden for a country without content.

### Selection

- Only for a finished run with a missed question (end reason `wrong` or `timeout`).
- Candidates: facts whose subject is the target country, its primary capital or one of its official languages, minus facts that reveal the attribute the question asked for; plus the phrase set of the target's official languages.
- The pick is random but stable for a run: seeded by the run id, so a reload shows the same card.
- One card per run, never more.

### API

- The missed question in a finished run's result gains `didYouKnow`: null, or either `{kind: "fact", text: {de, en}, source: {name, url}}` or `{kind: "phrases", language: {de, en}, langCode, words: [{key, word, transliteration?}], source: {name, url}}`.
- The country domain core loads both files with the catalogue; the quiz core asks it for candidates. No new route.

### Frontend

- `FactCard` as in [design-system.md](../redesign/design-system.md): `info` colours, a globe icon for facts and a speech icon for phrases, the source as a link.
- Each phrase tile carries the language's `lang` attribute; meanings come from the app's messages.

### Content workflow

- Drafts may be produced with tooling (a script over Wikidata, or an LLM summarising a cited Wikipedia section), but every entry is checked by a person against its source before it is merged.
- Facts avoid politics, religion, conflicts and rankings that change yearly ("the richest", "the largest population"), so they stay true and neutral.

## Testing Decisions

- Importer tests (like the existing dataset checks): the validation failures above, and a generated-files diff in the gate.
- Domain tests of the selection: no fact revealing the asked attribute; the same run id gives the same pick; no card without content.
- Contract test on the finished run's result for both kinds and for null.
- Frontend feature test with `FakeApi`: the fact card, the phrase card with `lang` attributes, and no card for null.

## Out of Scope

- Audio pronunciation.
- Facts during the run or on correct answers.
- User-submitted facts or corrections in the app (issues on GitHub suffice).

## Further Notes

- New glossary terms: fact (a curated, sourced sentence about a country, capital or language), phrase set (five basic words in one language).
- The facts on the design screens (Djenné, Thimphu, the Hungarian words) are examples and still need checking against their sources.
