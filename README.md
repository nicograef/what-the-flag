# What The Flag

A Quizduell-like game about flags, countries and capitals, in German and English.
Play a practice round without an account, or challenge another player to a duel.

## Setup

The repository follows the handbook's [new-project guide](https://github.com/nicograef/handbook/blob/main/guides/new-project.md), Go + React row.
Copy `.env.example` to `.env`, set a password and uncomment `DB_HOST`. Then run `make db`, `make db-migrate`, `make be` and `make fe`.

## Commands

`make help` lists every target. `make check` runs the gate that CI runs.
