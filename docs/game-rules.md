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
| 2 | name → capital, capital → name, flag → continent, name → currency |
| 3 | flag → capital, capital → flag, name → language, capital → continent |
| 4 | flag → currency, flag → language, capital → currency, capital → language |

- Questions 1 to 5 use tier 1 only. Each further block of five allows the next tier, up to tier 4 from question 16.
- Within the allowed tiers, the type is drawn at random.
- Each country has a fame tier: the 50 largest by area are tier 1, ranks 51 to 120 tier 2, the rest tier 3. A curated list adjusts some.
- Questions 1 to 8 target fame tier 1 and questions 9 to 16 tiers 1 and 2. Later ones target any country.
- No country is the target twice in one quiz.
- Wrong options come from the target's continent when it holds at least eight countries, else from the whole pool.
- Two flags a player cannot tell apart are a look-alike pair, such as Indonesia and Monaco. They never appear in the same flag question.
- A question that shows a flag never offers a continent, language or currency of the target's look-alike as a wrong option.
- No two options of a question show the same text.
- Continents are Africa, Americas, Asia, Europe and Oceania.
- A country on two continents, such as Russia or Turkey, has a main one, the correct option. Its other continent is never offered.

## Runs

A run is one player's pass through a quiz. It starts with a name and lasts until the first miss.

- A name has 1 to 20 characters after trimming; inner spaces collapse to one.
- It holds letters, digits, spaces, `_`, `-` and `.`. It appears publicly on the leaderboards and need not be unique.
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
- A question is drawn when a run first reaches its position, then stored for every later run.

## Leaderboards

| Leaderboard | Holds |
| --- | --- |
| Global | Runs that created their quiz; runs from a challenge link do not count here |
| Quiz | Every run of one quiz |

- Each leaderboard shows the top 100 ended runs: by score descending, then by earlier end.
- Equal scores share a rank: 1, 1, 3.
- A finished run shows its rank on its quiz's leaderboard, and on the global one when it counts there.
- A name may appear many times, once per run.
- A hidden run appears on no leaderboard. Only the owner hides runs.
