# Plan: Accounts, sessions and the all-time leaderboard

> Source PRD: docs/prds/prd-rebuild.md (sections "Accounts", "Leaderboard and points", HTTP contract, Frontend)

## Goal

A visitor registers with a username and password and stays logged in for 30 sliding days.
A user changes their emoji, logs out, deletes their account and searches other users by name prefix.
Duels and weekly award points through one ledger call; the all-time leaderboard ranks users by total.

## Architectural decisions

- **Case-insensitive usernames**: `UNIQUE INDEX users_username_lower_key ON users (lower(username) text_pattern_ops)`. No citext: it needs an extension and an sqlc type override. Usernames are ASCII, so `lower()` is exact. The index serves both equality and prefix `LIKE`. The stored username keeps its case for display.
- **Username rule**: `^[A-Za-z0-9_]{3,20}$`, also a `CHECK` on the column. Usernames are immutable after registration.
- **Password rule**: 8 to 128 Unicode code points. Go counts `utf8.RuneCountInString`; Zod counts `[...value].length`.
- **Hashing**: argon2id via `golang.org/x/crypto/argon2 — IDKey()`, m=19456 KiB, t=2, p=1, 16-byte salt, 32-byte key. Stored as a PHC string `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`; verification reads the parameters from the string. Source to re-check at execution: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (Argon2id section). A login for an unknown username verifies against a fixed dummy hash, so timing reveals nothing.
- **Hash parameters are a value**: `account.HashParams` is passed to `NewService`; service tests pass m=64, t=1 to stay fast.
- **Sessions**: token = 32 bytes from `crypto/rand`, base64url in the cookie. `sessions.token_hash` holds its SHA-256. Lifetime 30 days. A request whose session's `last_seen_at` is over one hour old sets `last_seen_at = now`, `expires_at = now + 30 d` and re-sends the cookie. An expired session is deleted on lookup. Register and login delete all expired sessions.
- **Cookie**: `__Host-session=<token>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`, no `Domain`. Logout and account deletion send it with `Max-Age=0`.
- **Dev cookies**: no dev switch and no new env var. Chromium and Firefox treat `http://localhost` as a secure context, so `Secure` and `__Host-` cookies set through the Vite proxy on `localhost:5173` are kept (inference; verified in phase 1). Safari does not; dev uses Chromium or Firefox.
- **Client address**: the rightmost entry of `X-Forwarded-For`, else the host of `r.RemoteAddr`. Caddy's `reverse_proxy` sets `X-Forwarded-For` and, without `trusted_proxies`, ignores client-sent values ([docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)). Trust rule: the backend publishes no port in production, so every request passed Caddy. IPv6 addresses are keyed by their /64 prefix.
- **Rate limit**: in-memory `golang.org/x/time/rate` limiters per client address, driven by the injected clock through `AllowN(now, 1)`. Login: burst 10, one token per 30 s. Registration: burst 5, one token per 10 min. Every attempt counts. Full buckets are pruned when the map exceeds 10,000 keys. A denied request gets `429` and `Retry-After` in seconds. One backend instance makes in-memory state sufficient.
- **Auth for other domains**: `account.Handler — RequireUser(next http.Handler) http.Handler` answers `401 unauthenticated` or calls `next` with the user id in the context. `account — UserID(ctx) uuid.UUID` reads it and panics outside `RequireUser`. Other domains' `NewHandler` take `requireUser func(http.Handler) http.Handler`; `main.go` passes `accountHandler.RequireUser`.
- **IDs**: `github.com/google/uuid — UUID` in Go via an sqlc `db_type: uuid` override in `backend/sqlc.yaml`, unless the foundation already set it.
- **Emoji list**: `backend/internal/account/emoji.go — Emojis`, 24 animal emoji. Registration picks one with the injected `func(n int) int`. `GET /api/me` returns the list as `emojis`, so the frontend holds no copy.
- **Pagination**: `offset` and `limit` query parameters everywhere; responses carry `nextOffset` (number or `null`). Rank pages are numeric, and the tables are small. Search: default limit 20, max 50. Leaderboard: default 50, max 100.
- **User search**: `query` is 1–20 characters of the username alphabet, else `400 invalid_query`. The service escapes `_` and `\` before `lower(username) LIKE lower($1) || '%'`. Results exclude the caller and sort by `lower(username)`.
- **Ledger ownership**: leaderboard SQL reads `ledger_entries` only. Names and emoji come from `account.Service — UsersByID()` behind a leaderboard-declared interface, as the PRD's module rule demands. Account reads totals through its own `PointsTotaler` interface, met by `leaderboard.Service — Total()`.
- **Transaction sharing**: `leaderboard.Service — Award(ctx, tx pgx.Tx, userID uuid.UUID, kind Kind, sourceID uuid.UUID, points int32) (bool, error)`. The store runs `db.New(pool).WithTx(tx)` when `tx` is non-nil, else the pool. The caller owns `Begin`/`Commit`. `INSERT … ON CONFLICT DO NOTHING` makes awards idempotent; the bool reports an insert. `Kind` is `KindDuel` or `KindWeekly`.
- **All-time ranking**: only users with ledger entries are ranked, `RANK() OVER (ORDER BY sum(points) DESC)`, ties ordered by user id for stable pages. A viewer without points gets `viewer.rank = null`, `points = 0`.
- **Redirects**: a logged-out visitor on a player route goes to `/login?next=<path>`. After login or registration the app goes to `next` if it starts with `/` but not `//`, else `/dashboard`. A logged-in user on `/login` or `/register` goes to `/dashboard`. Logout and deletion clear the query cache and go to `/`.
- **Session query**: `frontend/src/features/auth/useSession.ts — useSession()`, query key `['session']`, calls `GET /api/me`; a 401 resolves to `null`, not an error.
- **Forms**: shadcn form components with `react-hook-form` and `@hookform/resolvers/zod`, per https://ui.shadcn.com/docs/forms/react-hook-form at execution time. Server error codes map to messages in the feature's `messages.ts`; a `field` puts the message under that input.

### Error codes

Generic codes (malformed JSON, wrong content type, `Origin` mismatch, internal) belong to `backend/internal/httpx`.

| Code | Status | Field | Route and cause |
| --- | --- | --- | --- |
| `invalid_username` | 400 | `username` | `POST /accounts`: breaks the username rule |
| `invalid_password` | 400 | `password` | `POST /accounts`: length outside 8–128 |
| `username_taken` | 409 | `username` | `POST /accounts`: exists in any letter case |
| `invalid_credentials` | 401 | — | `POST /session`: unknown user, wrong or malformed password |
| `rate_limited` | 429 | — | `POST /accounts`, `POST /session`: bucket empty |
| `unauthenticated` | 401 | — | any `RequireUser` route: no, unknown or expired session |
| `invalid_emoji` | 400 | `emoji` | `PATCH /me`: not in the list |
| `invalid_query` | 400 | `query` | `GET /users`: breaks the query rule |
| `invalid_pagination` | 400 | `offset` or `limit` | `GET /users`, `GET /leaderboard`: negative or above max |

### Schema (compact)

- `000002_accounts.up.sql`: `users(id uuid PK DEFAULT uuidv7(), username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'), password_hash text NOT NULL, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`; unique index above. `sessions(id uuid PK DEFAULT uuidv7(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, token_hash bytea NOT NULL UNIQUE, created_at, last_seen_at, expires_at timestamptz NOT NULL)`; indexes on `sessions(user_id)` and `sessions(expires_at)`. Session timestamps come from the injected clock, not `now()`.
- `000003_ledger.up.sql`: `ledger_entries(id uuid PK DEFAULT uuidv7(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, source_kind text NOT NULL CHECK (source_kind IN ('duel','weekly')), source_id uuid NOT NULL, points integer NOT NULL CHECK (points > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, source_kind, source_id))`.

## Inventory

- `backend/cmd/what-the-flag/main.go` — wiring choke file; each phase adds its constructors and `Register(mux)`.
- `backend/internal/httpx/` — JSON read/write, error envelope, Origin and JSON checks for unsafe methods (foundation).
- `backend/internal/postgres/` — pool construction and the integration-test helper (foundation).
- `backend/sqlc.yaml`, `backend/internal/db/` — sqlc config and generated code; regenerate with `cd backend && go tool sqlc generate`.
- `frontend/src/lib/api.ts` — the single API client and `ApiError` with `code` and `field` (foundation).
- `frontend/src/lib/i18n/` — `useMessages(messages)` (foundation).
- `frontend/src/app/router.tsx` — route table choke file; `frontend/src/app/Navbar.tsx` — the navbar (foundation).
- Library versions resolve at execution: `go get <module>@latest` in `backend/`, `pnpm add <pkg>` in `frontend/`, shadcn components via `pnpm dlx shadcn@latest add <component>`.

## Open questions / Risks

- **Firefox and `__Host-` on `http://localhost`**: Chromium accepts it; Firefox is unverified. If Firefox drops the cookie, recommended: serve Vite over HTTPS with `@vitejs/plugin-basic-ssl`; alternative: document Chromium only for dev.
- **`/dashboard` before the duels plan lands**: the post-login target 404s until then. Recommended: accept it, the release ships all plans; alternative: target `/profile` and let the duels plan edit `frontend/src/features/auth/redirects.ts`.
- **Needs from foundation**: `frontend/src/app/Navbar.tsx` exists and renders a right-hand slot; `httpx` exports an error writer taking code, status, message and field; the Origin check accepts the Vite proxy in dev; the frontend test setup offers a fake of `frontend/src/lib/api.ts`.
- **Needs from duels and weekly**: call `leaderboard.Service — Award()` inside the transaction that finishes the round, with the duel or weekly challenge id as `sourceID`.

## Phase 1: Register and stay logged in

**Depends on**: none (runs after the foundation plan)

### Context

- `database/migrations/000002_accounts.up.sql` — new, the `users` and `sessions` schema above.
- `backend/sqlc/queries/account.sql` — new: `CreateUser`, `GetUserByID`, `CreateSession`, `GetSessionByTokenHash`, `TouchSession`, `DeleteSession`, `DeleteExpiredSessions`.
- `backend/sqlc.yaml` — uuid override if missing; `backend/internal/db/` regenerated.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/crypto`, `github.com/google/uuid`.
- Integration tests need `make db db-migrate` first.

### What to build

- `backend/internal/account/service.go` — `Service`, `Store` interface, `NewService(store, HashParams, now func() time.Time, intn func(int) int)`, `Register()`, `Authenticate(tokenHash)` with sliding and expiry, username and password rules.
- `backend/internal/account/password.go` — PHC encode, `hashPassword()`, `verifyPassword()`.
- `backend/internal/account/emoji.go` — `Emojis`.
- `backend/internal/account/store.go` — pgx store over `db.Queries`; maps the unique violation on `users_username_lower_key` to `ErrUsernameTaken`.
- `backend/internal/account/handler.go` — `NewHandler`, `Register(mux)`, `POST /api/accounts` (201, cookie, me body), `GET /api/me` (`{id, username, emoji, createdAt, emojis}`), `RequireUser()`, `UserID()`, cookie helpers.
- `backend/internal/account/service_test.go` — in-memory fake store and fixed clock: username and password rule tables, session expiry after 30 idle days, sliding after one hour.
- `backend/internal/account/handler_test.go` — `TestSessionCookie`: register response's `Set-Cookie` carries every attribute of the decision.
- `backend/internal/account/store_test.go` (`//go:build integration`) — case-insensitive uniqueness, session cascade on user delete.
- `backend/cmd/what-the-flag/main.go` — wire account store, service, handler.
- `frontend/src/features/auth/` — `api.ts` (`register()`, `getMe()` with Zod schemas), `schemas.ts` (Zod username and password rules), `messages.ts`, `useSession.ts`, `RegisterPage.tsx`, `UserMenu.tsx` (emoji + username linking to `/profile`, or log-in and register links), `RegisterPage.test.tsx`.
- `frontend/src/components/ui/` — `field.tsx`, `input.tsx`, `button.tsx`, `label.tsx`, `card.tsx` via the shadcn CLI, plus `frontend/package.json` and `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/register`; `frontend/src/app/Navbar.tsx` — mount `UserMenu`.

### Acceptance criteria

- [ ] Username, password and session-sliding rules hold (service): `cd backend && go test -race ./internal/account -run TestService`
- [ ] Register sets the `__Host-session` cookie with all attributes (handler): `cd backend && go test -race ./internal/account -run TestSessionCookie`
- [ ] `Alice` and `alice` cannot both register; deleting a user deletes its sessions (integration): `cd backend && go test -tags=integration -race ./internal/account -run TestStore`
- [ ] Invalid input shows field messages without a request; a valid submit calls `register` and `username_taken` shows under the field (frontend): `cd frontend && pnpm vitest run src/features/auth/RegisterPage.test.tsx`
- [ ] Generated code is current: `cd backend && go tool sqlc diff`
- [ ] `make check` passes

## Phase 2: Log in, log out, rate limits and protected routes

**Depends on**: 1

### Context

- `backend/internal/account/service.go — Register()`, `Authenticate()` — login reuses the password and session code.
- `backend/sqlc/queries/account.sql` — add `GetUserByUsernameLower`; `backend/internal/db/` regenerated.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/time`.

### What to build

- `backend/internal/account/service.go` — `Login()` with the dummy-hash path, `Logout()`.
- `backend/internal/account/ratelimit.go` — `Limiter` keyed by address, injected clock, pruning; `clientAddr(r)` with the /64 rule.
- `backend/internal/account/ratelimit_test.go` — burst then deny, refill after the interval, separate addresses, one IPv6 /64 shares a bucket; `clientAddr` table (single XFF, chained XFF takes the rightmost, no XFF, IPv6).
- `backend/internal/account/handler.go` — `POST /api/session`, `DELETE /api/session` (204, cookie cleared), limiter on register and login.
- `backend/internal/account/service_test.go` — login with wrong password, unknown user and mixed-case username.
- `backend/cmd/what-the-flag/main.go` — construct both limiters.
- `frontend/src/features/auth/` — `api.ts` (`login()`, `logout()`), `LoginPage.tsx`, `RequireUser.tsx` (protected-route wrapper), `redirects.ts` (`safeNext()`, `AFTER_LOGIN = '/dashboard'`), `LoginPage.test.tsx`; `RegisterPage.tsx` gains the `next` redirect and the logged-in redirect.
- `frontend/src/app/router.tsx` — `/login`.

### Acceptance criteria

- [ ] Rate limit and client-address rules hold (service, pure function): `cd backend && go test -race ./internal/account -run 'TestLimiter|TestClientAddr'`
- [ ] Login accepts any letter case of the username and rejects wrong credentials alike (service): `cd backend && go test -race ./internal/account -run TestServiceLogin`
- [ ] Invalid input blocks the request; `invalid_credentials` and `rate_limited` show their messages; success goes to `next` (frontend): `cd frontend && pnpm vitest run src/features/auth/LoginPage.test.tsx`
- [ ] `make check` passes

## Phase 3: Profile, emoji and account deletion

**Depends on**: 2

### Context

- `backend/internal/account/handler.go — RequireUser()` — guards the new routes.
- `backend/sqlc/queries/account.sql` — add `UpdateUserEmoji`, `DeleteUser`; `backend/internal/db/` regenerated.

### What to build

- `backend/internal/account/service.go` — `SetEmoji()` validating against `Emojis`, `Delete()`.
- `backend/internal/account/handler.go` — `PATCH /api/me` (`{emoji}` → me body), `DELETE /api/me` (204, cookie cleared). Rows of other domains go through their `ON DELETE CASCADE` FKs to `users`.
- `backend/internal/account/service_test.go` — unknown emoji rejected, listed emoji stored.
- `frontend/src/features/profile/` — `api.ts` (`updateEmoji()`, `deleteAccount()`), `messages.ts`, `ProfilePage.tsx` (username, emoji grid picker, log-out button, delete with confirmation dialog), `ProfilePage.test.tsx`.
- `frontend/src/components/ui/alert-dialog.tsx` via the shadcn CLI, plus `frontend/package.json` and `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/profile` inside `RequireUser`.

### Acceptance criteria

- [ ] Emoji outside the list is rejected (service): `cd backend && go test -race ./internal/account -run TestServiceSetEmoji`
- [ ] Picking an emoji calls `updateEmoji` and updates the navbar; deletion calls `deleteAccount` only after confirmation (frontend): `cd frontend && pnpm vitest run src/features/profile/ProfilePage.test.tsx`
- [ ] `make check` passes

## Phase 4: User search

**Depends on**: 3

### Context

- `backend/sqlc/queries/account.sql` — add `SearchUsersByPrefix` (excludes caller, ordered by `lower(username)`, `LIMIT`/`OFFSET`) and `GetUsersByIDs`; `backend/internal/db/` regenerated.

### What to build

- `backend/internal/account/service.go` — `Search()` with the query rule and `LIKE` escaping; `UsersByID()` for the leaderboard.
- `backend/internal/account/handler.go` — `GET /api/users?query=&offset=&limit=` → `{users: [{username, emoji}], nextOffset}`; fetches `limit + 1` rows to set `nextOffset`.
- `backend/internal/account/store_test.go` — prefix match in any case, `_` matches only itself, caller excluded, page boundaries.
- The duels plan builds the frontend consumer.

### Acceptance criteria

- [ ] Prefix search, escaping, exclusion and paging hold (integration): `cd backend && go test -tags=integration -race ./internal/account -run TestStoreSearch`
- [ ] `make check` passes

## Phase 5: Ledger and all-time leaderboard

**Depends on**: 4

### Context

- `database/migrations/000003_ledger.up.sql` — new, the ledger schema above.
- `backend/sqlc/queries/leaderboard.sql` — new: `InsertLedgerEntry` (`ON CONFLICT DO NOTHING`), `UserTotal`, `RankedPage`, `RankOfUser`, `CountRanked`; `backend/internal/db/` regenerated.
- `backend/internal/account/service.go — UsersByID()` — names and emoji for a page.

### What to build

- `backend/internal/leaderboard/service.go` — `Store` interface (methods take `tx pgx.Tx`, nil means pool), `Kind`, `Award()` rejecting points ≤ 0 and unknown kinds, `Total()`, `Page(viewer, offset, limit)`.
- `backend/internal/leaderboard/store.go` — pgx store; `WithTx` when `tx` is non-nil.
- `backend/internal/leaderboard/handler.go` — `GET /api/leaderboard?offset=&limit=` behind `requireUser` → `{entries: [{rank, username, emoji, points, isViewer}], viewer: {rank, points}, nextOffset}`.
- `backend/internal/leaderboard/service_test.go` — `Award` validation; viewer without points gets a null rank.
- `backend/internal/leaderboard/store_test.go` (`//go:build integration`) — second identical award inserts nothing; equal totals share a rank and the next rank skips; ledger rows vanish with their user; an award inside a rolled-back tx leaves no row.
- `backend/internal/account/handler.go` — `GET /api/me` adds `points` from a `PointsTotaler` interface declared in `backend/internal/account/service.go`.
- `backend/cmd/what-the-flag/main.go` — wire leaderboard store, service, handler; pass it to the account handler.
- `frontend/src/features/leaderboard/` — `api.ts`, `messages.ts`, `LeaderboardPage.tsx` (ranks, emoji, names, points, previous/next, the viewer's row pinned when off-page).
- `frontend/src/features/auth/api.ts` — `points` in the me schema; `frontend/src/features/profile/ProfilePage.tsx` — shows total points.
- `frontend/src/app/router.tsx` — `/leaderboard` inside `RequireUser`.

### Acceptance criteria

- [ ] Award validation and the unranked viewer hold (service): `cd backend && go test -race ./internal/leaderboard -run TestService`
- [ ] Idempotency, `RANK()` ties, cascade and tx rollback hold (integration): `cd backend && go test -tags=integration -race ./internal/leaderboard -run TestStore`
- [ ] Generated code is current: `cd backend && go tool sqlc diff`
- [ ] `make check` passes
