# Ubiquitous Language

| Term | Definition | Avoid |
| --- | --- | --- |
| Country | One entry of the catalogue, identified by its ISO 3166-1 alpha-2 code. | nation, state |
| Catalogue | All countries loaded from the generated dataset. | country list, database |
| Quiz pool | The 197 catalogue countries that questions are drawn from. | sovereign list |
| Primary capital | The one capital a question about a country uses. | main city |
| Flag key | The opaque file name of a flag, which hides the country code. | flag id, flag code |
| Mode | The kind of a question: what is shown and what is asked, e.g. flag to capital. | quiz mode, type |
| Question | A target country, a mode, four options and the correct option. | task, challenge |
| Option | One of the four selectable answers of a question. | choice, answer |
| Target | The country a question asks about. | solution |
| Distractor | A wrong option. | decoy |
| Quiz set | An ordered, immutable list of questions that one or more players answer. | quiz, game |
| Round | One player's pass through one quiz set, with their answers and timings. | attempt, game, session |
| Answer | The option a player picked for one question of a round, or a timeout. | result, guess |
| Practice round | A round on a private quiz set that belongs to no user and awards no points. | training, solo game |
| User | A registered account. | member |
| Player | A user in the role of playing a round. | gamer |
| Session | A logged-in device, backed by a server-side record. | token, login |
| Duel | A quiz set that exactly two users each play one round of. | challenge, match |
| Challenger | The user who created a duel. | sender, from |
| Opponent | The other user of a duel, from the viewer's side. | enemy, to |
| Weekly challenge | The one quiz set of an ISO week that every user may play once. | challenge of the week |
| Points | The score a user earns from duels and weekly challenges. | score, coins |
| Ledger | The append-only list of point awards; a user's total is its sum. | points table |
| Leaderboard | A ranking of users: all-time by total points, weekly by round result. | ranking, high score |
