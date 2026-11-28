# Copy

Every user-facing string of the redesign in German and English.
Strings go into the feature `messages.ts` files built with `defineMessages` (AGENTS.md). Generic error codes stay in `src/lib/i18n/error-messages.ts`.
`{n}`, `{name}` and similar are parameters. "(sr)" marks screen-reader-only text.

## Keys that stay

These keys keep their current text. Everything else in these files is replaced by the tables below.

| File | Keys |
| --- | --- |
| `src/app/messages.ts` | `brand`, `leaderboard`, `switchLocale`, `switchLocaleShort`, `credits`, `notFound`, `backHome` |
| `src/features/play/messages.ts` | `nameLabel`, `questions` (one sentence per type id), `flag`, `flagOption`, `timeLeft`, `seconds`, `secondsShort`, `correct`, `tooFast`, `correctAnswer`, `yourAnswer`, `loading`, `retry`, `copiedShort`, `errors` |
| `src/features/challenge/messages.ts` | `loading`, `retry`, `home`, `errors` |
| `src/features/leaderboard/messages.ts` | `empty`, `loading`, `retry` |
| `src/lib/i18n/error-messages.ts` | every key |

- `errors.invalid_name` is the name validation message.
- `credits` is the data credit line. `switchLocaleShort` is the visible switch label, `switchLocale` its accessible name.

## Shared

| Key | de | en |
| --- | --- | --- |
| namePublic | Erscheint öffentlich in der Rangliste. | Appears publicly on the leaderboard. |
| namePlaceholder | z. B. Kim | e.g. Kim |
| changeName | Name ändern | Change name |
| playingAs | als {name} | as {name} |
| holdToStart (coarse pointer) | Halten zum Starten | Hold to start |
| start (fine pointer) | Starten | Start |
| holdToAccept (coarse pointer) | Halten zum Annehmen | Hold to accept |
| accept (fine pointer) | Annehmen | Accept |
| holdHintStart | So antwortest du auch: halten, bis der Balken voll ist. | That's how you answer too: hold until the bar fills. |

## Home

| Key | de | en |
| --- | --- | --- |
| headline | Wie weit kommst du? | How far can you get? |
| rule1 | 15 Sekunden pro Frage | 15 seconds per question |
| rule2 | Alle 5 Fragen ein Level schwerer, bis Level 10 | One level harder every 5 questions, up to level 10 |
| rule3 | Ein Fehler und es ist vorbei | One miss and it's over |
| yourRecord | Dein Rekord | Your record |
| worldRankMeta | Dein bester Platz: {rank} weltweit | Your best rank: {rank} worldwide |
| lastQuiz | Dein letztes Quiz | Your latest quiz |
| play | Spielen | Play |

## Rank names

One neutral rank per level. The label reads "Level {n} · {rank}".

| Level | de | en |
| --- | --- | --- |
| 1 | Neuling | Newcomer |
| 2 | Tourist | Tourist |
| 3 | Wanderer | Wanderer |
| 4 | Pfadfinder | Pathfinder |
| 5 | Entdecker | Explorer |
| 6 | Abenteurer | Adventurer |
| 7 | Weltenbummler | Globetrotter |
| 8 | Navigator | Navigator |
| 9 | Kartograf | Cartographer |
| 10 | Legende | Legend |

## Play

| Key | de | en |
| --- | --- | --- |
| level | Level {n} · {rank} | Level {n} · {rank} |
| levelPosition (sr) | Frage {k} von 5 | Question {k} of 5 |
| streak (sr) | {n} richtig | {n} correct |
| recordIn | Rekord in {n} | Record in {n} |
| recordTied | Rekord eingestellt | Record tied |
| recordNew | Neuer Rekord | New record |
| creatorIn | {name} in {n} | {name} in {n} |
| creatorTied | {name} eingeholt | Level with {name} |
| creatorBeaten | {name} geschlagen | {name} beaten |
| answerHow (sr, `aria-describedby`) | Auf dem Touchscreen halten, sonst klicken oder Enter drücken. | Hold on a touch screen; otherwise click or press Enter. |
| holdHint (touch, first three questions of the first run) | Antwort halten, bis der Balken voll ist | Hold your answer until the bar fills |
| holding | Festhalten … | Keep holding … |
| wrong | Leider falsch | Not quite |
| timedOut | Zeit abgelaufen | Time's up |
| revealHint | Die richtige Antwort trägt einen Haken. | The correct answer has a check mark. |
| resultSoon | Gleich siehst du dein Ergebnis … | Your result is coming … |
| nextSoon | Nächste Frage kommt … | Next question … |
| toastRecord | Neuer Rekord! | New record! |
| toastRecordBody | Du hast deine {n} geknackt. Weiter so. | You beat your {n}. Keep going. |
| toastCreator | Du hast {name} überholt! | You passed {name}! |
| toastLevel | Level {n} erreicht: {rank} | Level {n} reached: {rank} |
| resumed (1) | Willkommen zurück. Die Uhr lief weiter: noch 1 Sekunde. | Welcome back. The clock kept running: 1 second left. |
| resumed (n) | Willkommen zurück. Die Uhr lief weiter: noch {s} Sekunden. | Welcome back. The clock kept running: {s} seconds left. |
| offline | Keine Verbindung. Deine Antwort ist gespeichert, wir senden sie gleich nochmal. | No connection. Your answer is kept; we'll send it again shortly. |
| offlineRetry | Jetzt senden | Send now |
| offlineClock | Achtung: Die Uhr auf dem Server läuft weiter. | Note: the clock on the server keeps running. |
| sending (sr) | wird gesendet | sending |

## Learning card

| Key | de | en |
| --- | --- | --- |
| learnTitle | Merk dir das | Remember this |
| learnCorrect | Richtig | Correct |
| learnPick | Deine Wahl | Your pick |
| factCapital | Hauptstadt | Capital |
| factRegion | Kontinent | Continent |
| factLanguages (1) | Amtssprache | Official language |
| factLanguages (n) | Amtssprachen | Official languages |
| factCurrencies (1) | Währung | Currency |
| factCurrencies (n) | Währungen | Currencies |
| learnTimeout | Zeit abgelaufen. | Time ran out. |
| learnTooFast | Unter 0,3 Sekunden zählt eine Antwort als falsch. | An answer under 0.3 seconds counts as wrong. |

### Learning sentences

The card shows one sentence, picked by type id.

- The "pick" sentence applies when the pick is wrong and `fact.chosenCountry` is set.
- Otherwise the "target" sentence applies.
- A timeout puts `learnTimeout` before the target sentence. A too-fast pick puts `learnTooFast` before it.

Parameters:

| Parameter | Value |
| --- | --- |
| `{target}` | `fact.name` |
| `{chosen}` | `fact.chosenCountry` |
| `{correct}` | the correct option's label |
| `{pick}` | the picked option's label |
| `{prompt}` | the prompt's label |
| `{spokenIn}` | `fact.spokenIn`, joined with `Intl.ListFormat` |

Article rule: a country name never follows an article or a preposition.
It stands before a dash or after a colon, as in "Schweiz – Hauptstadt: Bern". German needs an article for names such as "die Schweiz", and the catalogue has none.

| Type id | Pick sentence (de / en) | Target sentence (de / en) |
| --- | --- | --- |
| `flag_name` | — | Diese Flagge gehört zu: {target}. / This flag belongs to: {target}. |
| `name_flag` | Deine Flagge gehört zu: {chosen}. / Your flag belongs to: {chosen}. | Die richtige Flagge gehört zu: {target}. / The correct flag belongs to: {target}. |
| `name_region` | — | {target} – Kontinent: {correct}. / {target} – continent: {correct}. |
| `name_capital` | {chosen} – Hauptstadt: {pick}. / {chosen} – capital: {pick}. | {target} – Hauptstadt: {correct}. / {target} – capital: {correct}. |
| `capital_name` | — | {target} – Hauptstadt: {prompt}. / {target} – capital: {prompt}. |
| `flag_region` | — | {target} – Kontinent: {correct}. / {target} – continent: {correct}. |
| `name_currency` | {chosen} – Währung: {pick}. / {chosen} – currency: {pick}. | {target} – Währung: {correct}. / {target} – currency: {correct}. |
| `flag_capital` | {chosen} – Hauptstadt: {pick}. / {chosen} – capital: {pick}. | {target} – Hauptstadt: {correct}. / {target} – capital: {correct}. |
| `capital_flag` | Deine Flagge gehört zu: {chosen}. / Your flag belongs to: {chosen}. | {target} – Hauptstadt: {prompt}. / {target} – capital: {prompt}. |
| `name_language` | {chosen} – Amtssprache: {pick}. / {chosen} – official language: {pick}. | {target} – Amtssprache: {correct}. / {target} – official language: {correct}. |
| `capital_region` | — | {target} – Hauptstadt: {prompt}, Kontinent: {correct}. / {target} – capital: {prompt}, continent: {correct}. |
| `flag_currency` | {chosen} – Währung: {pick}. / {chosen} – currency: {pick}. | {target} – Währung: {correct}. / {target} – currency: {correct}. |
| `flag_language` | {chosen} – Amtssprache: {pick}. / {chosen} – official language: {pick}. | {target} – Amtssprache: {correct}. / {target} – official language: {correct}. |
| `capital_currency` | {chosen} – Währung: {pick}. / {chosen} – currency: {pick}. | {target} – Hauptstadt: {prompt}, Währung: {correct}. / {target} – capital: {prompt}, currency: {correct}. |
| `capital_language` | {chosen} – Amtssprache: {pick}. / {chosen} – official language: {pick}. | {target} – Hauptstadt: {prompt}, Amtssprache: {correct}. / {target} – capital: {prompt}, official language: {correct}. |
| `regional_language_name` | — | {prompt} – gesprochen in: {spokenIn}. / {prompt} – spoken in: {spokenIn}. |

- "—" marks a country answer: the pick is a country, and the payload holds none of its facts.
- In a NOT miss the pick holds the relation the question denies. Its pick sentence says so, such as "{pick} – grenzt an: {target}."
- The kinds lane adds a row for each new type id before the type ships.

## Result

| Key | de | en |
| --- | --- | --- |
| headCompleted | Du hast die Welt durchgespielt | You've played the whole world |
| headFirst | Dein erster Rekord! | Your first record! |
| headRecord | Neuer Rekord! | New record! |
| headTied | Rekord eingestellt! | Record tied! |
| headNearMiss | So knapp! | So close! |
| headTimeout | Zeit abgelaufen | Time's up |
| headOver | Vorbei! | Game over |
| headBehind | Noch {n}, um {name} zu schlagen | {n} more to beat {name} |
| scoreLine | richtig in Folge · Level {level} | in a row · level {level} |
| scoreWorldRank | · Platz {rank} weltweit | · rank {rank} worldwide |
| scoreBestRank | · dein bester Platz: {rank} weltweit | · your best rank: {rank} worldwide |
| recordLine | vorher {old} · Level {level} | before {old} · level {level} |
| recordBadge | Neuer Rekord · vorher {old} | New record · before {old} |
| recordBadgeFirst | Dein erster Rekord | Your first record |
| gapToRecord | Noch {n} bis zum neuen Rekord | {n} more for a new record |
| runStripWrong (sr) | Dein Lauf: {n} richtig, dann ein Fehler | Your run: {n} correct, then a miss |
| runStripTimeout (sr) | Dein Lauf: {n} richtig, dann lief die Zeit ab | Your run: {n} correct, then time ran out |
| runStripCompleted (sr) | Dein Lauf: alle {n} richtig | Your run: all {n} correct |
| playAgain | Nochmal | Play again |
| shareRun | Wer schafft mehr als {n}? | Who can beat {n}? |
| shareRecord | Rekord teilen | Share your record |
| shareCompleted | Das muss jeder wissen | Everyone needs to see this |

`recordLine` and `scoreLine` append `scoreWorldRank` or `scoreBestRank` only on a creator run.

## Share

| Key | de | en |
| --- | --- | --- |
| sheetTitle | Fordere jemanden heraus | Challenge someone |
| sheetBody | Wer den Link öffnet, spielt genau deine Fragen. Nichts wird verraten. | Whoever opens the link plays exactly your questions. Nothing is spoiled. |
| previewCaption | So sieht es im Chat aus | This is how it looks in the chat |
| shareNative | Teilen … | Share … |
| copy | Text und Link kopieren | Copy text and link |
| copied | Kopiert! | Copied! |
| close (sr) | Schließen | Close |
| shareText | What The Flag: {n} in Folge, Level {level}\n{strip}\nGleiche Fragen. Schaffst du mehr?\n{url} | What The Flag: {n} in a row, level {level}\n{strip}\nSame questions. Can you beat it?\n{url} |
| shareTextWon | Ich habe {n} in {creator}s Quiz geschafft. Holst du es dir zurück?\n{url} | I got {n} in {creator}'s quiz. Want it back?\n{url} |

## Challenge

| Key | de | en |
| --- | --- | --- |
| challengedBy | {name} fordert dich heraus | {name} challenges you |
| target | Genau dieselben Fragen. Schaffst du {n}? | Exactly the same questions. Can you get {n}? |
| you | Du | You |
| waitingTitle | {name} spielt gerade | {name} is still playing |
| waitingBody | Sobald {name} fertig ist, siehst du das Ergebnis hier und kannst sofort loslegen. Die Seite aktualisiert sich von selbst. | As soon as {name} finishes, you'll see the score here and can start right away. This page updates by itself. |
| waitingName | Trag schon mal deinen Namen ein | Enter your name while you wait |
| waitingButton | Warte auf {name} … | Waiting for {name} … |
| waitingOwnGame | Solange ein eigenes Spiel starten | Start your own game meanwhile |
| unlocked (sr, `role=status`) | Das Quiz ist jetzt offen. | The quiz is open now. |
| ownQuizTitle | Dein Quiz | Your quiz |
| ownQuizBody | Du hast {n} geschafft. Gleiche Fragen, neuer Versuch? | You got {n}. Same questions, another go? |
| wonTitle | Du hast {name} geschlagen! | You beat {name}! |
| tiedTitle | Gleichstand mit {name} | Tied with {name} |
| headToHead (sr) | Du: {a}, {name}: {b} | You: {a}, {name}: {b} |
| quizRankLine | Platz {rank} in {name}s Quiz | Rank {rank} in {name}'s quiz |
| challengeNote | Herausforderungen zählen nur in diesem Quiz. Für die Weltrangliste startest du ein eigenes Spiel. | Challenges count only in this quiz. Start your own game for the world leaderboard. |
| tellCreator | {name} Bescheid geben | Tell {name} |
| ownGameWorld | Eigenes Spiel für die Weltrangliste | Own game for the world leaderboard |

## Leaderboard

| Key | de | en |
| --- | --- | --- |
| title | Rangliste | Leaderboard |
| tabWorld | Weltweit | World |
| tabLastQuiz | Letztes Quiz | Latest quiz |
| subWorld | Bestes eigenes Spiel je Spieler, aller Zeiten | Each player's best own game, all time |
| subLastQuiz | {name}s Quiz | {name}'s quiz |
| subOwnQuiz | Dein Quiz | Your quiz |
| rank | Platz {n} | Rank {n} |
| youSuffix | (du) | (you) |
| pinnedYou | Du | You |

## Follow-ups

These strings ship with their PRD and stay out of `messages.ts` until then.

| PRD | Key | de | en |
| --- | --- | --- | --- |
| Daily quiz | dailyTitle | Tagesquiz | Daily quiz |
| Daily quiz | dailyBody | Gleiche Fragen für alle. Ein Versuch. | Same questions for everyone. One try. |
| Daily quiz | dailyPlayed | Heute: Platz {rank} mit {n} | Today: rank {rank} with {n} |
| Daily quiz | dailyHead | Tagesquiz vom {date} | Daily quiz of {date} |
| Daily quiz | tabToday | Heute | Today |
| Daily quiz | subToday | Tagesquiz vom {date} | Daily quiz of {date} |
| Daily quiz | shareDaily | Tagesquiz {date}: {n} in Folge\n{strip}\n{url} | Daily quiz {date}: {n} in a row\n{strip}\n{url} |
| Daily quiz | errors.daily_played | Du hast das heutige Tagesquiz schon gespielt. | You've already played today's daily quiz. |
| Did you know | dykTitle | Wusstest du? | Did you know? |
| Did you know | phrasesTitle | Wusstest du? So spricht man in: {country} | Did you know? This is how they talk in: {country} |
| Did you know | phraseWords | Hallo, Danke, Tschüss, Ja, Nein | Hello, Thank you, Goodbye, Yes, No |
| Did you know | source | Quelle: {source} | Source: {source} |
| Challenge preview | ogTitle | {name} schafft {score}. Und du? | {name} got {score}. Can you beat it? |
| Challenge preview | ogDescription | Gleiche Fragen. 15 Sekunden pro Frage. Ein Fehler und es ist vorbei. | Same questions. 15 seconds per question. One miss and it's over. |

## Formats

- German genitives of names: names ending in s, ß, x or z take an apostrophe (`Jonas' Quiz`), others a plain s (`Nicos Quiz`). The message function handles it.
- Plurals: a key marked (1) and (n) has a singular and a plural form, chosen by the message function.
- Dates: `Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })` over the plain date. That gives "28. Nov." and "Nov 28".
- Lists: `Intl.ListFormat(locale, { type: "conjunction" })`.
- Rank names have one form for every player.
