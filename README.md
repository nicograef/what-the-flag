# What The Flag

An endless quiz about flags, countries and capitals, in German and English.
Enter a name, answer until the first miss, and land on the leaderboard.
[docs/game-rules.md](docs/game-rules.md) states the rules.

## Quick start

The repository follows the handbook's [new-project guide](https://github.com/nicograef/handbook/blob/main/guides/new-project.md), Go + React row.
Copy `.env.example` to `.env`, set a password and uncomment `DB_HOST`.

| Command | Does |
| --- | --- |
| `make db` | Starts the Postgres container |
| `make db-migrate` | Applies pending migrations to it |
| `make be` | Starts the backend on :8080 |
| `make fe` | Starts the Vite dev server, which proxies `/api` to :8080 |
| `make check` | Runs the steps of CI's backend and frontend jobs |
| `make be-integration` | Runs CI's integration tests against the `make db` database |
| `make e2e` | Runs CI's e2e job: builds the production stack, serves it with local TLS and smoke-tests it |

`make help` lists every target.

## Deploy

The server follows the handbook's [deploy guide](https://github.com/nicograef/handbook/blob/main/guides/deploy.md) and [backup and restore guide](https://github.com/nicograef/handbook/blob/main/guides/backup-restore.md).
`make prod-release VERSION=X.Y.Z` tags a main commit whose CI passed, and the tag builds the images.
`docker-compose.prod.yml` pins one tag for all three images.

| Command | Does |
| --- | --- |
| `DOMAIN=what-the-flag.de make prod-deploy` | Backs up, pulls the pinned images, migrates and starts the stack |
| `make prod-migrate ARGS=version` | Prints the production migration version; without `ARGS` it applies pending migrations |
| `make prod-stats` | Prints the owner statistics |
| `make prod-hide RUN=<uuid>` | Hides a run from every leaderboard |

## Licence

Code: MIT (`LICENSE`). Data: ODbL-1.0 (`data/LICENSE`). Credits: `NOTICE`.
