# PRD: Did you know? (facts and phrases)

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screens: game over (06, 06b) and new record (07) in [docs/redesign/screens.md](../redesign/screens.md).
> Its data follows the source rules of [prd-quiz-knowledge.md](prd-quiz-knowledge.md#sources-and-licences).

## Problem Statement

A miss ends the run, and the learning card explains the answer. Then the player leaves with a single fact they already half knew.
The game covers 197 countries, but it says nothing about them beyond the attribute it asks.
No curiosity is sparked, and nothing makes a country memorable.

## Solution

Under the learning card, the result shows one "Wusstest du?" card about the missed question's context.
That is its country, its capital or one of its languages, but never the answer it asked for.
It is one of two kinds, picked at random:

- a short fact with its source, such as "In Mali steht die Große Moschee von Djenné, das größte Lehmgebäude der Welt.";
- five basic words in an official language of the country: hello, thank you, goodbye, yes, no.

The facts and words come from curated, sourced data files checked in like the country data.

## User Stories

- As a player, I want a surprising fact about the country I just missed, so that I remember it next time.
- As a player, I want to learn hello, thank you, goodbye, yes and no in that country's language, so that I take something useful away.
- As a player, I want to see where a fact comes from, so that I can trust it and read more.
- As a player, I want the card not to repeat the answer I just saw, so that it adds something new.
- As a screen reader user, I want foreign words read in their language, so that I hear the right pronunciation.
- As the owner, I want every fact sourced and reviewed in the repository, so that the game never teaches something wrong.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| Curated files of facts in own words and of phrases, drafted from Wikipedia, Wikidata and Wiktionary, reviewed, imported like the country data | Medium (content work) | Content takes time; coverage grows over releases | High | **Yes** |
| Generate facts from Wikidata statements only (highest point, population, founding year) | Medium | Correct but dull; no phrases | High | No, but usable as a seed for the curated file |
| Fetch Wikipedia summaries at runtime | Low | Network at runtime, unchecked text, copied CC BY-SA prose | Low | No: [prd-rebuild.md](prd-rebuild.md) keeps all data checked in |

### Licence

- Open: the owner decides it when this PRD is planned.
- Until then the default holds: facts are written in own words and cited by URL. No Wikipedia or Wiktionary prose is copied.
- Single phrase words are cited by URL as well.
- The files form their own artefact with their own licence note, apart from the ODbL catalogue (D13).

### Data

- One curated file of facts and one of phrases, beside the existing curated files.
- A fact has:
  - an id;
  - its subject: a country code, plus optionally "capital" or a language code;
  - the attributes it would reveal, if any;
  - German and English text of at most 140 characters;
  - a source name and URL.
- The revealable attributes are every answer attribute of the question model: flag, capital, continent, currency, official language, calling code, neighbour and former name. A NOT type reveals the same attribute as its positive type.
- A phrase set has:
  - a language code and its writing direction;
  - the five words, each with an optional Latin transliteration for non-Latin scripts;
  - a source name and URL.
- A word with no plain equivalent, such as yes and no in some languages, may be left out. The card then shows four words.
- The importer validates both files. It fails the gate on:
  - a missing language or source;
  - an over-long text;
  - an unknown subject or attribute;
  - a duplicate id.

### Coverage

- Goal for the first release: one fact for each of the 197 countries, and phrases for the most spoken official language of each.
- CLDR `territoryInfo.json`, which the knowledge PRD vendors, picks the most spoken official language.
- Coverage is a goal, not a release gate. The card is hidden for a country without content.

### Selection

- Only for a finished run with a missed question (end reason `wrong` or `timeout`).
- Candidates:
  - facts whose subject is the target country, its primary capital or one of its official languages;
  - minus facts that reveal the attribute the question asked for;
  - plus the phrase sets of the target's official languages, unless the question asked for a language.
- The pick is random but stable for a run: seeded by the run id, so a reload shows the same card.
- One card per run, never more.

### API

- The finished-run result gains `didYouKnow`, beside `fact`. It is null, or one of:
  - `{kind: "fact", text: {de, en}, source: {name, url}}`;
  - `{kind: "phrases", language: {de, en}, langCode, dir, words: [{key, word, transliteration?}], source: {name, url}}`.
- The country domain core loads both files with the catalogue; the quiz core asks it for candidates. No new route.

### Frontend

- `DidYouKnowCard` as in [design-system.md](../redesign/design-system.md): `info` colours, a globe icon for facts, a speech icon for phrases.
- It sits below the learning card. The source is a link with a 44 px target.
- Each phrase tile carries the language's `lang` and `dir`. Meanings come from the app's messages.
- Copy: the "Did you know" rows of [copy.md](../redesign/copy.md#follow-ups).

### Content workflow

- Drafts may come from tooling: a script over Wikidata, or an LLM summarising a cited Wikipedia section in own words.
- A person checks every entry against its source before it is merged.
- Facts avoid politics, religion, conflicts and rankings that change yearly ("the richest", "the largest population"). So they stay true and neutral.

## Testing Decisions

- Importer tests, like the existing dataset checks: the validation failures above, and a generated-files diff in the gate.
- Domain tests of the selection:
  - no fact revealing the asked attribute;
  - no phrase set after a language question;
  - the same run id gives the same pick;
  - no card without content.
- Contract test on the finished run's result for both kinds and for null.
- Frontend feature test with `FakeApi`: a fact, a phrase set with `lang` and `dir`, and no card for null.

## Out of Scope

- Audio pronunciation.
- Facts during the run or on correct answers.
- User-submitted facts or corrections in the app; issues on GitHub suffice.

## Further Notes

- This PRD is planned as a phase of [prd-quiz-knowledge.md](prd-quiz-knowledge.md), after the question-kinds plan fixes the attribute list.
- New glossary terms when it lands:
  - Did-you-know fact: a curated, sourced sentence in own words about a country, capital or language;
  - Phrase set: five basic words in one language.
- The facts on the design screens (Djenné, Thimphu, the Hungarian words) are examples and still need checking against their sources.
