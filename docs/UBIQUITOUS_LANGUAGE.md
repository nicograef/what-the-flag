# Ubiquitous Language

| Term | Definition | Avoid |
| --- | --- | --- |
| Country | One entry of the catalogue, identified by its ISO 3166-1 alpha-2 code. | nation, state |
| Catalogue | All countries loaded from the generated dataset, looked up by code. | country list, database |
| Quiz pool | The 197 countries that questions are drawn from; the generated dataset holds exactly these. | sovereign list |
| Primary capital | The one capital a question about a country uses. | main city |
| Flag key | The opaque file name of a flag, which hides the country code. | flag id, flag code |
| Look-alike pair | Two flags a player cannot tell apart; they never share a flag question. | similar flags, twin flags |
| Mode | The kind of a question: what is shown and what is asked, e.g. flag to capital. | quiz mode, type |
| Question | A target country, a mode, four options and the correct option. | task, challenge (noun) |
| Option | One of the four selectable answers of a question. | choice, answer |
| Target | The country a question asks about. | solution |
| Distractor | A wrong option. | decoy |
| Quiz set | An ordered, immutable list of questions that one or more players answer. | quiz, game |
| Set kind | What a quiz set is for: `practice` or `duel`. | set type, mode |
| Round | One player's pass through one quiz set, with their answers and timings. | attempt, game, session |
| Answer | The option a player picked for one question of a round, or a timeout. | result, guess |
| Practice round | A round on a private quiz set that belongs to no user and awards no points. | training, solo game |
| User | A registered account. | member |
| Player | A user in the role of playing a round. | gamer |
| Session | A logged-in device, backed by a server-side record. | token, login |
| Duel | A quiz set that exactly two users each play one round of; a user challenges another to it. | challenge (noun), match |
| Challenger | The user who created a duel. | sender, from |
| Opponent | The other user of a duel, from the viewer's side. | enemy, to |
| Duel status | How a duel looks to one viewer: `your_turn`, `waiting`, `completed` or `expired`. | duel state, phase |
| Expired duel | A duel not completed seven days after its creation; it awards no points. | lapsed duel, timed-out duel |
| Points | What a user earns from duels; "scoring" names only the act of awarding them. | score, coins |
| Ledger | The append-only list of point awards, one per user and source; a user's total is its sum. | points table |
| Source kind | What a ledger entry was awarded for; the only one is `duel`. | source type |
| Leaderboard | The all-time ranking of users by total points, top 100 plus the viewer's row. | ranking, high score |
