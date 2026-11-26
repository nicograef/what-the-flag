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
| Question | A target country, a mode, four options and the correct option. | task, challenge |
| Option | One of the four selectable answers of a question. | choice, answer |
| Target | The country a question asks about. | solution |
| Distractor | A wrong option. | decoy |
| Run | One visitor's pass of questions, from the start until the first wrong or late answer. | game, round, session, challenge, attempt |
| Player name | The free text a visitor enters to start a run; the leaderboard shows it. | username, account, nickname |
| Answer | The option a visitor picked for one question of a run, or a timeout. | result, guess |
| Score | The number of correct answers of a run. | points, high score |
| End reason | Why a run ended: `wrong`, `timeout` or `completed`. | status, outcome |
| Sweep | The server job that ends runs with an expired question and deletes old runs. | cron, cleanup job |
| Leaderboard | The two rankings of finished runs: today and all time, top 100 each. | ranking, high-score list |
| Entry | One finished run on the leaderboard: player name, score and end time. | row, record, high score |
| Today | The current calendar day in Europe/Berlin, which bounds today's list. | daily, last 24 hours |
