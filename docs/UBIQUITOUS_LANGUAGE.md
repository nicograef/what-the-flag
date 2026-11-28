# Ubiquitous Language

| Term | Definition | Avoid |
| --- | --- | --- |
| Country | One entry of the catalogue, identified by its ISO 3166-1 alpha-2 code. | nation, state |
| Catalogue | All countries loaded from the generated dataset, looked up by code. | country list, database |
| Quiz pool | The 197 countries that questions are drawn from; the generated dataset holds exactly these. | sovereign list |
| Attribute | One kind of fact about a country with labels in both languages, e.g. capital or currency. | property, field |
| Continent | One of Africa, Americas, Asia, Europe, Oceania; a country can count in more than one. Code and wire call it region: `AttrRegion`, `Country.Region`/`OtherRegions`, the type ids `name_region`, `flag_region`, `capital_region`. | region (outside code) |
| Subregion | A part of a continent from the mledoze source, such as Western Europe or the Caribbean; from level 4 wrong options come from the target's subregion first. Code: `Country.Subregion`. | area, zone |
| Official language | A language official at national level in a country, or its de facto national language where none is official; language questions ask for one. Code and wire call it language: `Country.Languages`, `name_language`. | national language |
| Regional language | A curated regional, minority, indigenous or creole language established in a country where it is not official; the regional-language question asks for a country of its spoken-in list. Code and wire: `Country.RegionalLanguages`, `regional_language_name`. | dialect, minority language |
| Spoken-in list | A regional language's countries where it is established and not official; the possible correct answers of its question. Code: `spokenIn` in `data/regional-languages.json`. | heartland |
| Blocked language | A language with a lesser status or a community in a country, such as Arabic in Israel or Welsh in Argentina; never asked about it and never a wrong option for it. Code: `Country.BlockedLanguages`. | excluded language |
| Language family | Standard varieties of one language a player could take for one another, such as Hindi and Urdu; no two options of a language question share one. | language group |
| Currency family | Currency units a player could mistake for one another, such as Rupee and Rupiah, or every Dollar; no two options of a currency question share one. | currency group |
| Primary capital | The one capital a question about a country uses. | main city |
| Flag key | The opaque file name of a flag, which hides the country code. | flag id, flag code |
| Look-alike pair | Two flags a player cannot tell apart; they never share a flag question. | similar flags, twin flags |
| Question type | A prompt attribute paired with an answer attribute, e.g. flag to capital. | mode, quiz mode |
| Difficulty tier | How hard a question type is, from tier 1 up; a level asks the tiers of its type window. | level |
| Type window | The tiers a level asks: two below the level up to the level, extended one tier down until it holds four types. | tier range |
| Fame ceiling | The least famous fame tier a level allows for targets and first-group wrong options. | fame gate |
| Candidate group | One set of possible wrong options, such as the famous countries of the target's continent; groups are drawn in order. | proximity level |
| Giveaway | A name-capital pair sharing a word, such as Guatemala and Guatemala-Stadt; name → capital and capital → name skip its country. | leak |
| Fame tier | How well known a country is, from its German Wikipedia pageview rank in the quiz pool and adjusted by a curated list. | popularity |
| Question | A target country, a question type, four options and the correct option. | task, challenge |
| Option | One of the four selectable answers of a question. | choice, answer |
| Target | The country a question asks about. | solution |
| Distractor | A wrong option. | decoy |
| Lure share | The share of answers that picked a distractor among the answers to questions offering it, per question type and target; `make stats` lists it. | pick rate, trap rate |
| Question space | Every question the generator can produce from the catalogue: each type, target and prompt, one case each. | question pool |
| True set | The options of a case that answer it correctly: the target, its values, or every country a prompted regional language is spoken in. | correct set |
| Contested set | The options of a case a player could defend though they are not true, such as another continent of the target or a look-alike's value. | grey zone |
| Defensible set | The true set and the contested set together; no wrong option lies in it. | fair set |
| Review dump | A Markdown listing of one fixed-seed question per case of the question space, for editorial review: `make data-review`. | sample report |
| Quiz | A stored sequence of questions with a public id; every run on it gets the same questions. | game, set, challenge |
| Run | One visitor's pass through a quiz, until the first wrong or late answer; its id is private. | game, round, session, attempt |
| Creator | The run that created its quiz; only creators count on the global leaderboard. | owner, host |
| Challenge link | The public link `/q/<quizId>` that lets others play the same quiz. | invite, share URL |
| Player name | The free text a visitor enters to start a run; the leaderboards show it. | username, account, nickname |
| Player | A visitor recognised by a player key, without signup; runs belong to a player, and a later account would attach to one. | user, account, profile |
| Player key | The random key in the HttpOnly cookie `wtf_player` that identifies a player; the server stores only its hash. | session, token, user id |
| Answer | The option a visitor picked for one question of a run, or a timeout. | result, guess |
| Score | The number of correct answers of a run. | points, high score |
| End reason | Why a run ended: `wrong`, `timeout` or `completed`. | status, outcome |
| Global leaderboard | The top 100 players of all time, each with their best visible creator run. | ranking, high-score list |
| Quiz leaderboard | The top 100 players of one quiz, each with their best visible run on it. | challenge ranking |
| Hidden run | A run the owner removed from every leaderboard. | banned, deleted |
| Level | The difficulty step of a run position, 1 to 10: one per five questions, level 10 from question 46 on. It sets the question types and target fame a question can have; the server sends it with every question and the result. | stage, band, round; tier (a tier is a question type's difficulty) |
| Rank name | The neutral title of a level shown beside its number, from Neuling (1) to Legende (10). | level name, theme |
| Personal best | The highest score over a player's ended runs, kept on the server per player key and sent as `best`. | high score; record is fine in UI copy |
| Hold to answer | Committing an option by holding it 400 ms with a touch or pen; a mouse click or a key commits at once. | long press, confirm |
| Arming | The 400 ms after a question renders in which its options ignore presses. | cooldown, debounce |
| Result guard | The 1000 ms after a result renders in which its buttons ignore presses. | cooldown, debounce |
| Learning card | The one card on the result screen after a miss: the correct option beside the pick, one sentence and a row of the target's key facts. | fact card, tip, info box |
| Run strip | One square per answer of a run in blocks of five, shown on the result and in the share text. | emoji grid, history |
