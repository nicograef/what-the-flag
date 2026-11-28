# Copy

Every user-facing string of the redesign in German and English. Implementation puts them in the feature `messages.ts` files built with `defineMessages` (AGENTS.md); generic error codes stay in `src/lib/i18n/error-messages.ts`.
`{n}`, `{name}` and similar are parameters; plural forms are written out where German or English need them.

## Shared

| Key | de | en |
| --- | --- | --- |
| brand | What The Flag | What The Flag |
| leaderboard | Rangliste | Leaderboard |
| switchLocale (button shows the other language) | EN | DE |
| namePublic | Erscheint öffentlich in der Rangliste. | Appears publicly on the leaderboard. |
| nameLabel | Dein Name | Your name |
| namePlaceholder | z. B. Kim | e.g. Kim |
| changeName | Name ändern | Change name |
| playingAs | als {name} | as {name} |
| arming | Gleich … | One moment … |
| holdToStart | Halten zum Starten | Hold to start |
| holdToAccept | Halten zum Annehmen | Hold to accept |
| holdHintStart | So antwortest du auch: kurz halten, bis es voll ist. | That's how you answer too: hold until it's full. |

## Home

| Key | de | en |
| --- | --- | --- |
| headline | Wie weit kommst du? | How far can you get? |
| rule1 | 15 Sekunden pro Frage | 15 seconds per question |
| rule2 | Alle 5 Fragen ein Level schwerer | One level harder every 5 questions |
| rule3 | Ein Fehler und es ist vorbei | One miss and it's over |
| yourRecord | Dein Rekord | Your record |
| recordMeta | Level {level} erreicht · Platz {rank} weltweit | Reached level {level} · rank {rank} worldwide |
| play | Spielen | Play |
| overtakenTitle | {name} hat dich überholt | {name} overtook you |
| overtakenBody | In {creator}s Quiz: {theirs} gegen deine {yours} | In {creator}'s quiz: {theirs} against your {yours} |
| overtakenAction | Zurückholen | Win it back |
| dailyTitle | Tagesquiz | Daily quiz |
| dailyBody | Gleiche Fragen für alle. Ein Versuch. | Same questions for everyone. One try. |

## Play

| Key | de | en |
| --- | --- | --- |
| level | Level {n} · {name} | Level {n} · {name} |
| levelNames | Flaggen, Hauptstädte, Sprachen, Profi | Flags, Capitals, Languages, Pro |
| streakLabel (aria) | {n} richtig | {n} correct |
| recordIn | Rekord in {n} | Record in {n} |
| recordTied | Rekord eingestellt | Record tied |
| recordNew | Neuer Rekord | New record |
| holdHint | Antwort kurz gedrückt halten | Press and hold your answer |
| holding | Festhalten … | Keep holding … |
| correct | Richtig! | Correct! |
| wrongNear | So knapp! | So close! |
| wrong | Leider falsch | Wrong |
| revealHint | Die richtige Antwort ist grün markiert. | The correct answer is marked green. |
| resultSoon | Gleich siehst du dein Ergebnis … | Your result is coming … |
| nextSoon | Nächste Frage kommt … | Next question … |
| toastRecord | Neuer Rekord! | New record! |
| toastRecordBody | Du hast deine {n} geknackt. Weiter so. | You beat your {n}. Keep going. |
| toastLevel | Level {n} erreicht! | Level {n} reached! |
| resumed | Willkommen zurück. Die Uhr lief weiter: noch {s} Sekunden. | Welcome back. The clock kept running: {s} seconds left. |
| offline | Keine Verbindung. Deine Antwort ist gespeichert, wir senden sie gleich nochmal. | No connection. Your answer is kept; we'll send it again shortly. |
| offlineRetry | Jetzt senden | Send now |
| offlineClock | Achtung: Die Uhr auf dem Server läuft weiter. | Note: the clock on the server keeps running. |
| sending (aria) | wird gesendet | sending |
| correctAnswer (aria) | richtige Antwort | correct answer |
| yourAnswer (aria) | deine Antwort | your answer |
| flagOption (aria) | Flagge {n} | Flag {n} |

## Result

| Key | de | en |
| --- | --- | --- |
| headNearMiss | So knapp! | So close! |
| headTimeout | Zeit abgelaufen | Time's up |
| headRecord | Neuer Rekord! | New record! |
| headCompleted | Du hast die Welt durchgespielt | You've played the whole world |
| scoreLine | richtig in Folge · Level {level} · Platz {rank} weltweit | in a row · level {level} · rank {rank} worldwide |
| recordLine | vorher {old} · Level {level} · Platz {rank} weltweit | before {old} · level {level} · rank {rank} worldwide |
| gapToRecord | Noch {n} bis zum neuen Rekord | {n} more for a new record |
| runStrip (aria) | Dein Lauf: {n} richtig, dann ein Fehler | Your run: {n} correct, then a miss |
| learnTitle | Merk dir das | Remember this |
| learnPickedOther (text questions) | {pick} gehört zu {country}. {question-sentence} | {pick} belongs to {country}. {question-sentence} |
| factTitle | Wusstest du? | Did you know? |
| phrasesTitle | Wusstest du? So spricht man in {country} | Did you know? This is how they talk in {country} |
| phraseWords | Hallo, Danke, Tschüss, Ja, Nein | Hello, Thank you, Goodbye, Yes, No |
| source | Quelle: {source} | Source: {source} |
| playAgain | Nochmal | Play again |
| shareNearMiss | Wer schafft mehr als {n}? | Who can beat {n}? |
| shareRecord | Rekord teilen | Share your record |
| shareCompleted | Das muss jeder wissen | Everyone needs to see this |
| newGame | Neues Spiel | New game |

## Share

| Key | de | en |
| --- | --- | --- |
| sheetTitle | Fordere jemanden heraus | Challenge someone |
| sheetBody | Wer den Link öffnet, spielt genau deine Fragen. Nichts wird verraten. | Whoever opens the link plays exactly your questions. Nothing is spoiled. |
| previewCaption | So sieht es im Chat aus | This is how it looks in the chat |
| shareNative | Teilen … | Share … |
| copy | Text und Link kopieren | Copy text and link |
| copied | Kopiert! | Copied! |
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
| wonTitle | Du hast {name} geschlagen! | You beat {name}! |
| tiedTitle | Gleichstand mit {name} | Tied with {name} |
| behindLine | Noch {n} bis {name} | {n} more to reach {name} |
| quizRankLine | Platz {rank} von {total} in {name}s Quiz | Rank {rank} of {total} in {name}'s quiz |
| challengeNote | Herausforderungen zählen nur in diesem Quiz. Für die Weltrangliste startest du ein eigenes Spiel. | Challenges count only in this quiz. Start your own game for the world leaderboard. |
| tellCreator | {name} Bescheid geben | Tell {name} |
| ownGameWorld | Eigenes Spiel für die Weltrangliste | Own game for the world leaderboard |

## Leaderboard

| Key | de | en |
| --- | --- | --- |
| tabWorld | Weltweit | World |
| tabToday | Heute | Today |
| tabQuiz | {name}s Quiz | {name}'s quiz |
| subWorld | Alle eigenen Spiele, aller Zeiten | All own games, all time |
| subToday | Tagesquiz vom {date} | Daily quiz of {date} |
| subQuiz | Deine letzte Herausforderung, {n} Spieler | Your last challenge, {n} players |
| rank | Platz {n} | Rank {n} |
| youSuffix | (du) | (you) |
| back (aria) | Zurück | Back |

German genitive note: names ending in s, ß, x or z take an apostrophe (`Jonas' Quiz`), others a plain s (`Nicos Quiz`). The message function handles it.
