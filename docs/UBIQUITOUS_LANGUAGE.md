# Ubiquitous Language

| Term | Definition | Avoid |
| --- | --- | --- |
| Country | One entry of the catalogue, identified by its ISO 3166-1 alpha-2 code. | nation, state |
| Catalogue | All countries loaded from the generated dataset, looked up by code. | country list, database |
| Quiz pool | The 197 countries that questions are drawn from; the generated dataset holds exactly these. | sovereign list |
| Attribute | One kind of fact about a country with labels in both languages, e.g. capital or currency. | property, field |
| Continent | One of Africa, Americas, Asia, Europe, Oceania; a country can count in more than one. Code and wire call it region: `AttrRegion`, `Country.Region`/`OtherRegions`, the type ids `name_region`, `flag_region`, `capital_region`. | region (outside code) |
| Official language | A language official at national level in a country, or its de facto national language where none is official; language questions ask for one. Code and wire call it language: `Country.Languages`, `name_language`. | national language |
| Regional language | A regional, minority, creole or indigenous language of the curated list, spoken in one to five countries; the regional-language question asks for one of them. Code and wire: `Country.RegionalLanguages`, `regional_language_name`. | dialect, minority language |
| Blocked language | Another country's official language with a lesser status in a country, such as Arabic in Israel; never a wrong option for it. Code: `Country.BlockedLanguages`. | excluded language |
| Language family | Standard varieties of one language a player could take for one another, such as Hindi and Urdu; no two options of a language question share one. | language group |
| Currency family | Currency units a player could mistake for one another, such as Rupee and Rupiah, or every Dollar; no two options of a currency question share one. | currency group |
| Primary capital | The one capital a question about a country uses. | main city |
| Flag key | The opaque file name of a flag, which hides the country code. | flag id, flag code |
| Look-alike pair | Two flags a player cannot tell apart; they never share a flag question. | similar flags, twin flags |
| Question type | A prompt attribute paired with an answer attribute, e.g. flag to capital. | mode, quiz mode |
| Difficulty tier | How hard a question type is; a quiz moves from easy tiers to hard ones. | level |
| Fame tier | How well known a country is, derived from its area rank in the quiz pool and adjusted by a curated list. | popularity |
| Question | A target country, a question type, four options and the correct option. | task, challenge |
| Option | One of the four selectable answers of a question. | choice, answer |
| Target | The country a question asks about. | solution |
| Distractor | A wrong option. | decoy |
| Quiz | A stored sequence of questions with a public id; every run on it gets the same questions. | game, set, challenge |
| Run | One visitor's pass through a quiz, until the first wrong or late answer; its id is private. | game, round, session, attempt |
| Creator | The run that created its quiz; only creators count on the global leaderboard. | owner, host |
| Challenge link | The public link `/q/<quizId>` that lets others play the same quiz. | invite, share URL |
| Player name | The free text a visitor enters to start a run; the leaderboards show it. | username, account, nickname |
| Answer | The option a visitor picked for one question of a run, or a timeout. | result, guess |
| Score | The number of correct answers of a run. | points, high score |
| End reason | Why a run ended: `wrong`, `timeout` or `completed`. | status, outcome |
| Global leaderboard | The top 100 creator runs of all time. | ranking, high-score list |
| Quiz leaderboard | The top 100 runs of one quiz. | challenge ranking |
| Hidden run | A run the owner removed from every leaderboard. | banned, deleted |
| Level | A block of five consecutive questions of a run, shown to the player; level n starts at question 5(n−1)+1 and allows difficulty tiers up to n, at most 4. | stage, round; tier (a tier is a question type's difficulty) |
| Personal best | The highest score this browser has reached, kept in the browser only. | high score, record (record is fine in UI copy) |
| Hold to answer | Committing an option by pressing it for 400 ms; a keyboard commits at once. | long press, confirm |
| Arming | The 400 ms after a question renders (1000 ms after a result renders) in which presses are ignored. | cooldown, debounce |
| Learning card | The one card on a result that explains the missed question: correct option, the pick and one sentence. | tip, explanation box |
| Run strip | One square per answer of a run in blocks of five, shown on the result and in the share text. | emoji grid, history |
| Remembered quiz | A quiz this browser played, kept in the browser with its own run id and last seen rank. | saved quiz, bookmark |
