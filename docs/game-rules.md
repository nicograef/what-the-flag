# Game rules

What The Flag asks about the 197 countries of the quiz pool: the 193 UN members, Vatican City, Palestine, Kosovo and Taiwan.
The data comes from open sources, credited in [NOTICE](../NOTICE). Its names, capitals and flags imply no political position.
Terms are defined in [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md).

## Questions

A question asks about one target country and shows four options; exactly one is correct.
It pairs a prompt attribute with an answer attribute. Each question type has a difficulty tier:

| Tier | Question types (prompt → answer) |
| --- | --- |
| 1 | flag → name, name → flag, name → continent |
| 2 | name → capital, capital → name, flag → continent |
| 3 | name → currency, capital → continent |
| 4 | flag → capital, capital → flag, name → official language |
| 6 | flag → currency |
| 7 | capital → currency |
| 8 | flag → official language, capital → official language |
| 9 | regional language → name |

A run climbs one level every five questions; the server sends the level with every question and the result.

| Level | Questions | Type tiers | Fame ceiling | Wrong options first from |
| --- | --- | --- | --- | --- |
| 1 | 1–5 | 1 | 1 | famous countries of the continent |
| 2 | 6–10 | 1–2 | 1 | famous countries of the continent |
| 3 | 11–15 | 1–3 | 2 | famous countries of the continent |
| 4 | 16–20 | 2–4 | 2 | the continent |
| 5 | 21–25 | 3–5 | 2 | the continent |
| 6 | 26–30 | 4–6 | 3 | the continent |
| 7 | 31–35 | 4–7 | 3 | the continent |
| 8 | 36–40 | 6–8 | 3 | the continent |
| 9 | 41–45 | 7–9 | 3 | the continent |
| 10 | 46+ | 7–10 | 3 | the continent |

- A level asks the tiers from two below its number up to its number, extended one tier down while that window holds fewer than four types.
- The type is drawn at random from the window, then a target among the unused countries within the level's fame ceiling. When none fits, the ceiling goes, then the window.
- Each country has a fame tier: the 50 most-viewed on German Wikipedia over 12 months are tier 1, ranks 51 to 120 tier 2, the rest tier 3. A curated list adjusts some.
- No country is the target twice in one quiz.
- Wrong options are drawn group by group. At levels 1 to 3 the groups are the target's continent within the fame ceiling, the rest of the continent, then the rest of the pool. From level 4 they are the continent, then the rest of the pool.
- A continent of fewer than eight countries counts as the rest of the pool. A continent, language or currency option belongs to the best group of any country holding it.
- No wrong option is one a player could defend as correct, such as a second continent of the target or a language it holds with any status.
- A name → capital or capital → name question skips a target whose name and capital share a word in German or English, such as Guatemala and Guatemala-Stadt.
- Two flags a player cannot tell apart are a look-alike pair, such as Indonesia and Monaco. They never appear in the same flag question.
- A question that shows a flag never offers a continent, language or currency of the target's look-alike as a wrong option.
- No two options of a question show the same text.
- Continents are Africa, Americas, Asia, Europe and Oceania.
- A country that spans or is also counted in a second continent, such as Russia, Turkey or Cyprus, has a main one, the correct option. Its other continent is never offered.
- Each language has at most one status in a country: official, regional or blocked.
- A country's official languages are those official at national level, or its de facto national language where none is official. A language question asks for one; its wrong options are official languages of other countries.
- A regional language is a regional, minority, creole or indigenous language of a curated list, established in a country where it is not official.
- A blocked language has a lesser status or a community in a country, such as Arabic in Israel. A country with a diaspora, such as Argentina for Welsh, blocks the language.
- No wrong option of a language question is a regional or blocked language of the target.
- A regional-language question shows a regional language of the target; a target without one gets another type. No wrong option holds the language in any status.
- A currency option shows the unit name without the country, such as Peso or Dollar.
- No two options of a currency question share a currency family, such as Rupee and Rupiah.
- No two options of a language question share a language family, such as Hindi and Urdu.

## Runs

A run is one player's pass through a quiz. It starts with a name and lasts until the first miss.

- A name has 1 to 20 characters after trimming; inner spaces collapse to one.
- It holds letters, digits, spaces, `_`, `-` and `.`, with at least one letter or digit. It appears publicly on the leaderboards and need not be unique.
- The server serves one question at a time and starts its clock when it serves it.
- A question shows 15 seconds. The server accepts an answer for 2 more seconds, the grace for slow networks.
- An answer within 300 ms of serving counts as wrong: no person reads that fast.
- A correct answer adds one point to the score. The next question follows.
- A reload shows the same open question; its clock keeps running.

A run ends with one of three end reasons:

| End reason | When |
| --- | --- |
| `wrong` | The player picks a wrong option, or answers within 300 ms |
| `timeout` | The clock runs out before an answer arrives |
| `completed` | Every country of the pool was a target, so no question is left |

After a `wrong` or `timeout` end, the result shows the missed question and its correct option. A finished run never changes.

## Quizzes

A quiz is a stored sequence of questions with a public id. Every run on it gets the same questions in the same order.

- Starting from the home page creates a fresh quiz. Its first run is the quiz's creator.
- The challenge link `/q/<quizId>` shows the creator's name and score and the quiz's leaderboard.
- The challenge link opens for play once the creator's run has ended.
- A hidden creator run does not hold the challenge link closed.
- A question is drawn when a run first reaches its position, then stored for every later run.

## Leaderboards

| Leaderboard | Holds |
| --- | --- |
| Global | Runs that created their quiz; runs from a challenge link do not count here |
| Quiz | Every run of one quiz |

- Each leaderboard shows the top 100 players by their best ended run: by score descending, then by earlier end.
- Equal scores share a rank: 1, 1, 3.
- A finished run shows its player's rank on its quiz's leaderboard, and on the global one when it counts there.
- A player appears once per leaderboard, with their best run; the name shown is that run's.
- A hidden run appears on no leaderboard. Only the owner hides runs, always every run of one player.
