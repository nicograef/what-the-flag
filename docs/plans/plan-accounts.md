# Plan: Accounts, sessions and the all-time leaderboard

> Source PRD: docs/prds/prd-rebuild.md (sections "Accounts", "Leaderboard and points", HTTP contract, Frontend)

## Goal

A visitor registers with a username and password and stays logged in for 30 sliding days.
A user changes their emoji, logs out, deletes their account and searches other users by name prefix.
Duels and weekly award points through one ledger call; the all-time leaderboard ranks users by total.

## Architectural decisions

- **Case-insensitive usernames**: `UNIQUE INDEX users_username_lower_key ON users (lower(username) text_pattern_ops)`. No citext: it needs an extension and an sqlc type override. Usernames are ASCII, so `lower()` is exact. The index serves both equality and prefix `LIKE`. The stored username keeps its case for display.
- **Username rule**: `^[A-Za-z0-9_]{3,20}$`, also a `CHECK` on the column. Usernames are immutable after registration.
- **Usernames are public**: search lists them to every user, so registration answers `username_taken` openly. Login still answers unknown user and wrong password alike.
- **Password rule**: 8 to 128 Unicode code points. Go counts `utf8.RuneCountInString`; Zod counts `[...value].length`.
- **Hashing**: argon2id via `golang.org/x/crypto/argon2 — IDKey()`, 16-byte salt, 32-byte key. PHC string `$argon2id$v=19$m=<m>,t=<t>,p=<p>$<salt>$<hash>`, unpadded standard base64. Verification reads the parameters from the string and compares with `crypto/subtle — ConstantTimeCompare()`. Parameters per https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (Argon2id): m=19456 KiB, t=2, p=1.
- **Hash constants (R17)**: `account.ArgonMemoryKiB = 19456` and `account.MaxConcurrentHashes = 4` are exported constants. `account.DefaultHashParams` uses them; `main.go` passes it to `NewService`. Service tests pass m=64, t=1.
- **Hash gate (R17)**: every hash and verify runs through `account — runHash()`, guarded by a buffered-channel semaphore of `MaxConcurrentHashes`. Waiting honours `ctx`; a cancelled request returns without hashing.
- **Login timing**: `NewService` hashes a fixed string once with its `HashParams` as the dummy hash. Login for an unknown username verifies against it. A login password outside 1–128 code points is rejected before any lookup.
- **Sessions**: token = 32 bytes from `crypto/rand`, base64url in the cookie. `sessions.token_hash` holds its SHA-256; lookup is by that unique column. Lifetime 30 days. A request whose session's `last_seen_at` is over one hour old sets `last_seen_at = now`, `expires_at = now + 30 d` and re-sends the cookie. An expired session is deleted on lookup. Register and login delete all expired sessions.
- **No session fixation**: the server alone mints tokens. Register and login always create a fresh session. A session cookie presented on that request is deleted.
- **Cookie**: `__Host-session=<token>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`, no `Domain`. Logout, account deletion and a `401 unauthenticated` for a presented but unknown or expired token send it with `Max-Age=0`.
- **Dev cookies (R16)**: no dev switch and no new env var. Chromium and Firefox treat `http://localhost` as a secure context, so `__Host-` cookies set through the Vite proxy should be kept (inference). Phase 1 verifies it manually in both browsers. If one drops the cookie, phase 1 serves Vite over HTTPS with `@vitejs/plugin-basic-ssl` and appends the decision to `docs/decisions.md`.
- **Client address**: `account — clientAddr(r)`. When the peer of `r.RemoteAddr` is loopback or private, the rightmost `X-Forwarded-For` entry wins; otherwise the peer itself. Caddy's `reverse_proxy` ignores client-sent `X-Forwarded-*` values without `trusted_proxies` ([docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)). Production publishes no backend port, so every request passes Caddy. IPv6 addresses are keyed by their /64 prefix.
- **Rate limit**: `golang.org/x/time/rate` limiters per client address in a mutex-guarded map, driven by the injected clock through `AllowN(now, 1)`. Login: burst 20, one token per 10 s. Registration: burst 10, one token per minute. Bursts fit a school class behind one NAT; the hash gate bounds the CPU cost. Every attempt counts. Full buckets are pruned when the map exceeds 10,000 keys. A denied request gets `429` and `Retry-After` set to the refill interval in seconds. One backend instance makes in-memory state sufficient.
- **Auth for other domains (R5)**:
  - `(h *account.Handler) RequireUser(next http.Handler) http.Handler` answers `401 unauthenticated` or calls `next` with the user id in the context. Other domains' `NewHandler` take `requireUser func(http.Handler) http.Handler`; `main.go` passes `accountHandler.RequireUser`.
  - `account.UserID(ctx context.Context) uuid.UUID` reads it and panics outside `RequireUser`.
  - `(h *account.Handler) OptionalUser(r *http.Request) (uuid.UUID, bool)` resolves a valid session without sliding or writing; quiz-practice wires it as its viewer function.
  - `account.PublicUser{ID uuid.UUID; Username, Emoji string}`.
  - `(s *account.Service) PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]PublicUser, error)`; missing ids are absent from the map.
  - `(s *account.Service) IDByUsername(ctx context.Context, username string) (uuid.UUID, error)`, any letter case; `account.ErrUserNotFound` when absent. Duels uses it for the opponent.
- **No email, no password reset** (R24, PRD).
- **IDs**: `github.com/google/uuid — UUID` via the override in foundation's `backend/sqlc.yaml` (R3).
- **Emoji list**: `backend/internal/account/emoji.go — Emojis`, 24 animal emoji. Registration picks one with the injected `func(n int) int`. `GET /api/me` returns the list as `emojis`, so the frontend holds no copy.
- **Pagination**: `offset` and `limit` query parameters; responses carry `nextOffset` (number or `null`). Stores fetch `limit + 1` rows to set it. Search: default limit 20, max 50. Leaderboard: default 50, max 100.
- **User search**: `query` is 1–20 characters of the username alphabet, else `400 invalid_query`. The service escapes `_` before `lower(username) LIKE lower($1) || '%'`. Results exclude the caller and sort by `lower(username)`.
- **Ledger ownership**: leaderboard SQL reads `ledger_entries` only. Names and emoji come from `account.Service — PublicByIDs()` behind a leaderboard-declared interface. Account reads totals through its own `PointsTotaler` interface, met by `(s *leaderboard.Service) Total(ctx, userID uuid.UUID) (int64, error)`.
- **Transaction sharing**: `(s *leaderboard.Service) Award(ctx context.Context, tx pgx.Tx, userID uuid.UUID, kind Kind, sourceID uuid.UUID, points int32) (bool, error)`.
  - It always writes through `db.New(pool).WithTx(tx)`; the caller owns `Begin`/`Commit`.
  - `INSERT … ON CONFLICT (user_id, source_kind, source_id) DO NOTHING` makes a repeat a no-op; the bool reports an insert.
  - `Kind` is a `string` type with `KindDuel = "duel"` and `KindWeekly = "weekly"`. Points ≤ 0 or an unknown kind return an error.
- **All-time ranking**: only users with ledger entries are ranked. A subquery computes `sum(points)` and `RANK() OVER (ORDER BY sum(points) DESC)` over all users; the outer query orders by total desc, user id, then applies `OFFSET`/`LIMIT`. The viewer's rank is `1 + count(users with a higher total)`. A viewer without points gets `viewer.rank = null`, `points = 0`. A ranked user missing from `PublicByIDs` (deleted meanwhile) is left out of the page.
- **Account deletion**: one `DELETE FROM users`. FK cascades remove sessions, ledger entries, rounds, duels and weekly entries (PRD). The other player's ledger rows for a cascaded duel stay; they reference the duel by value, not FK.
- **Redirects (R8)**: a logged-out visitor on a player route goes to `/login?next=<path>`. After login or registration the app goes to `next` if it starts with `/` but not `//`, else `/dashboard`. `/dashboard` 404s until the duels plan lands; accepted. A logged-in user on `/login` or `/register` goes to `/dashboard`. Logout and deletion clear the query cache and go to `/`.
- **Protected routes**: `frontend/src/features/auth/RequireUser.tsx — RequireUser` is a layout route element rendering `<Outlet />`. Every player route in `router.tsx` is its child.
- **Session query**: `frontend/src/features/auth/useSession.ts — useSession()`, query key `['session']`, calls `GET /api/me`; a 401 resolves to `null`. `/api/me` and `/api/leaderboard` are not localised, so their keys carry no locale (R20).
- **Forms**: shadcn form components with `react-hook-form` and `@hookform/resolvers/zod`, per https://ui.shadcn.com/docs/forms/react-hook-form at execution time. Server error codes map to messages in the feature's `messages.ts`; a `field` puts the message under that input.
- **Frontend tests (R18)**: `frontend/src/test/render.tsx — renderRoute()` with a fake `ApiClient`; nothing else fakes the server.

### Error codes

Generic codes come from `backend/internal/httpx` (`httpx.Error`, `httpx.WriteError()`).

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
| `invalid_pagination` | 400 | `offset` or `limit` | `GET /users`, `GET /leaderboard`: not an integer, negative or above max |

### Schema (compact)

- `000002_accounts.up.sql`: `users(id uuid PK DEFAULT uuidv7(), username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'), password_hash text NOT NULL, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`; unique index above. `sessions(id uuid PK DEFAULT uuidv7(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, token_hash bytea NOT NULL UNIQUE, created_at, last_seen_at, expires_at timestamptz NOT NULL)`; indexes on `sessions(user_id)` and `sessions(expires_at)`. Session timestamps come from the injected clock, not `now()`.
- `000003_ledger.up.sql`: `ledger_entries(id uuid PK DEFAULT uuidv7(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, source_kind text NOT NULL CHECK (source_kind IN ('duel','weekly')), source_id uuid NOT NULL, points integer NOT NULL CHECK (points > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, source_kind, source_id))`.

## Inventory

- `backend/cmd/what-the-flag/main.go` — wiring choke file; each phase adds its constructors and `Register(mux)`.
- `backend/internal/httpx/` — `ReadJSON()`, `WriteJSON()`, `Error`, `WriteError()`, Origin check on unsafe methods (foundation, R6).
- `backend/internal/postgres/` — pool construction and the integration-test helper (foundation).
- `backend/sqlc.yaml`, `backend/internal/db/` — sqlc config and generated code; regenerate with `cd backend && go tool sqlc generate`.
- `frontend/src/lib/api.ts — ApiClient, ApiError, useApiClient()` — the single API client (foundation).
- `frontend/src/lib/i18n/ — useMessages()` (foundation).
- `frontend/src/app/router.tsx — routes` — route table choke file; `frontend/src/app/navbar.tsx — Navbar` (foundation).
- `frontend/src/test/render.tsx — renderRoute()` — frontend test seam (foundation).
- Library versions resolve at execution: `go get <module>@latest` in `backend/`, `pnpm add <pkg>` in `frontend/`, shadcn components via `pnpm dlx shadcn@latest add <component>`.
- This plan edits no `Makefile` and no `.github/workflows/*` (R21). Integration tests need `make db` and `make db-migrate` first.

## Open questions / Risks

- **Cross-plan order**: phase 1 runs after the foundation plan. Duels and weekly call `Award()` with their `pgx.Tx` and the duel or weekly challenge id as `sourceID`; their consumer interfaces must match the exact signature above.
- **Dev HTTPS fallback (R16)**: if phase 1 adopts `@vitejs/plugin-basic-ssl`, the dev URL becomes `https://localhost:5173`. Foundation's cross-stack tracer `curl localhost:5173/api/health` then needs `-k https://`.
- **Login throttling is per address only** (PRD). Guessing one account from many addresses is bounded only by the hash gate. Accepted for a game without personal data.

## Phase 1: Register and stay logged in

**Depends on**: none

### Context

- `database/migrations/000002_accounts.up.sql` — new, the `users` and `sessions` schema above.
- `backend/sqlc/queries/account.sql` — new: `CreateUser`, `GetUserByID`, `CreateSession`, `GetSessionByTokenHash`, `TouchSession`, `DeleteSession`, `DeleteExpiredSessions`; `backend/internal/db/` regenerated.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/crypto`, `github.com/google/uuid`.

### What to build

- `backend/internal/account/service.go` — `Service`, `Store` interface, `NewService(store, HashParams, now func() time.Time, intn func(int) int)`, `Register()`, `Authenticate(tokenHash)` with sliding and expiry, username and password rules.
- `backend/internal/account/password.go` — `HashParams`, `DefaultHashParams`, `ArgonMemoryKiB`, `MaxConcurrentHashes`, `runHash()` gate, PHC encode, `hashPassword()`, `verifyPassword()`.
- `backend/internal/account/emoji.go` — `Emojis`.
- `backend/internal/account/store.go` — pgx store over `db.Queries`; maps the unique violation on `users_username_lower_key` to `ErrUsernameTaken`.
- `backend/internal/account/handler.go` — `NewHandler`, `Register(mux)`, `POST /api/accounts` (201, cookie, me body), `GET /api/me` (`{id, username, emoji, createdAt, emojis}`), `RequireUser()`, `UserID()`, `OptionalUser()`, cookie helpers.
- `backend/internal/account/service_test.go` — in-memory fake store and fixed clock: username and password rule tables, expiry after 30 idle days, sliding after one hour, a presented session deleted on register, hash round trip.
- `backend/internal/account/handler_test.go` — `TestSessionCookie`: register's `Set-Cookie` carries every attribute; a 401 for an expired token clears the cookie.
- `backend/internal/account/store_test.go` (`//go:build integration`) — case-insensitive uniqueness, session cascade on user delete.
- `backend/cmd/what-the-flag/main.go` — wire account store, service, handler.
- `frontend/src/features/auth/` — `api.ts` (`register()`, `getMe()` with Zod schemas), `schemas.ts` (Zod username and password rules), `messages.ts`, `useSession.ts`, `RegisterPage.tsx`, `UserMenu.tsx` (emoji + username linking to `/profile`, or log-in and register links), `RegisterPage.test.tsx`.
- `frontend/src/components/ui/` — `field.tsx`, `input.tsx`, `button.tsx`, `label.tsx`, `card.tsx` via the shadcn CLI, plus `frontend/package.json` and `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/register`; `frontend/src/app/navbar.tsx` — mount `UserMenu`.
- Only if the R16 check fails: `frontend/vite.config.ts` (basic-ssl plugin) and one appended line in `docs/decisions.md`.

### Acceptance criteria

- [ ] Username, password, fixation and session-sliding rules hold (service): `cd backend && go test -race ./internal/account -run TestService`
- [ ] Register sets the `__Host-session` cookie with all attributes; a stale token gets it cleared (handler): `cd backend && go test -race ./internal/account -run TestSessionCookie`
- [ ] `Alice` and `alice` cannot both register; deleting a user deletes its sessions (integration): `cd backend && go test -tags=integration -race ./internal/account -run TestStore`
- [ ] Invalid input shows field messages without a request; a valid submit calls `register`; `username_taken` shows under the field (frontend): `cd frontend && pnpm vitest run src/features/auth/RegisterPage.test.tsx`
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running, registering on the dev URL in Chromium and in Firefox shows the username in the navbar, and it survives a reload (manual, R16)
- [ ] `make check` passes

## Phase 2: Log in, log out, rate limits and protected routes

**Depends on**: 1

### Context

- `backend/internal/account/service.go — Register()`, `Authenticate()` — login reuses the password and session code.
- `backend/sqlc/queries/account.sql` — add `GetUserByUsernameLower`; `backend/internal/db/` regenerated.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/time`.

### What to build

- `backend/internal/account/service.go` — `Login()` with the dummy-hash path and presented-session deletion, `Logout()`.
- `backend/internal/account/ratelimit.go` — `Limiter` keyed by address, injected clock, pruning; `clientAddr(r)` with the trust and /64 rules.
- `backend/internal/account/ratelimit_test.go` — burst then deny, refill after the interval, separate addresses, one IPv6 /64 shares a bucket; `clientAddr` table (private peer with single and chained XFF takes the rightmost, public peer ignores XFF, no XFF, IPv6).
- `backend/internal/account/handler.go` — `POST /api/session`, `DELETE /api/session` (no auth; deletes the presented session if any; always 204 with the cookie cleared), limiter on register and login.
- `backend/internal/account/service_test.go` — login with wrong password, unknown user, overlong password, mixed-case username; a presented session is deleted.
- `backend/cmd/what-the-flag/main.go` — construct both limiters.
- `frontend/src/features/auth/` — `api.ts` (`login()`, `logout()`), `LoginPage.tsx`, `RequireUser.tsx`, `redirects.ts` (`safeNext()`, `AFTER_LOGIN = '/dashboard'`), `LoginPage.test.tsx`; `RegisterPage.tsx` gains the `next` redirect and the logged-in redirect.
- `frontend/src/app/router.tsx` — `/login`; the `RequireUser` layout route.

### Acceptance criteria

- [ ] Rate limit and client-address rules hold (unit): `cd backend && go test -race ./internal/account -run 'TestLimiter|TestClientAddr'`
- [ ] Login accepts any letter case, rejects wrong credentials alike and replaces a presented session (service): `cd backend && go test -race ./internal/account -run TestServiceLogin`
- [ ] Invalid input blocks the request; `invalid_credentials` and `rate_limited` show their messages; success goes to a safe `next`, `//evil` goes to `/dashboard` (frontend): `cd frontend && pnpm vitest run src/features/auth/LoginPage.test.tsx`
- [ ] `make check` passes

## Phase 3: Profile, emoji and account deletion

**Depends on**: 2

### Context

- `backend/internal/account/handler.go — RequireUser()` — guards the new routes.
- `backend/sqlc/queries/account.sql` — add `UpdateUserEmoji`, `DeleteUser`; `backend/internal/db/` regenerated.

### What to build

- `backend/internal/account/service.go` — `SetEmoji()` validating against `Emojis`, `Delete()`.
- `backend/internal/account/handler.go` — `PATCH /api/me` (`{emoji}` → me body), `DELETE /api/me` (204, cookie cleared).
- `backend/internal/account/service_test.go` — unknown emoji rejected, listed emoji stored.
- `frontend/src/features/profile/` — `api.ts` (`updateEmoji()`, `deleteAccount()`), `messages.ts`, `ProfilePage.tsx` (username, emoji grid picker, log-out button, delete with confirmation dialog), `ProfilePage.test.tsx`.
- `frontend/src/components/ui/alert-dialog.tsx` via the shadcn CLI, plus `frontend/package.json` and `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/profile` under `RequireUser`.

### Acceptance criteria

- [ ] Emoji outside the list is rejected, a listed one is stored (service): `cd backend && go test -race ./internal/account -run TestServiceSetEmoji`
- [ ] Picking an emoji calls `updateEmoji` and updates the navbar; deletion calls `deleteAccount` only after confirmation (frontend): `cd frontend && pnpm vitest run src/features/profile/ProfilePage.test.tsx`
- [ ] `make check` passes

## Phase 4: User search and public lookups

**Depends on**: 3

### Context

- `backend/sqlc/queries/account.sql` — add `SearchUsersByPrefix` (excludes caller, ordered by `lower(username)`, `LIMIT`/`OFFSET`) and `GetUsersByIDs`; `backend/internal/db/` regenerated.
- `backend/sqlc/queries/account.sql — GetUserByUsernameLower` — reused by `IDByUsername()`.

### What to build

- `backend/internal/account/service.go` — `Search()` with the query rule and `LIKE` escaping; `PublicUser`, `PublicByIDs()`, `IDByUsername()`, `ErrUserNotFound`.
- `backend/internal/account/handler.go` — `GET /api/users?query=&offset=&limit=` → `{users: [{username, emoji}], nextOffset}`.
- `backend/internal/account/store_test.go` — prefix match in any case, `_` matches only itself, caller excluded, page boundaries, `GetUsersByIDs` skips unknown ids.
- The duels plan builds the frontend consumer.

### Acceptance criteria

- [ ] Prefix search, escaping, exclusion, paging and the id lookup hold (integration): `cd backend && go test -tags=integration -race ./internal/account -run TestStoreSearch`
- [ ] `make check` passes

## Phase 5: Ledger and all-time leaderboard

**Depends on**: 4

### Context

- `database/migrations/000003_ledger.up.sql` — new, the ledger schema above.
- `backend/sqlc/queries/leaderboard.sql` — new: `InsertLedgerEntry` (`ON CONFLICT DO NOTHING`), `UserTotal`, `RankedPage`, `RankOfUser`; `backend/internal/db/` regenerated.
- `backend/internal/account/service.go — PublicByIDs()` — names and emoji for a page.

### What to build

- `backend/internal/leaderboard/service.go` — `Store` interface, `Kind`, `Award()` rejecting points ≤ 0 and unknown kinds, `Total()`, `Page(viewer, offset, limit)`, the `Users` interface for `PublicByIDs`.
- `backend/internal/leaderboard/store.go` — pgx store; `InsertLedgerEntry` runs on the caller's `tx`, reads on the pool.
- `backend/internal/leaderboard/handler.go` — `GET /api/leaderboard?offset=&limit=` behind `requireUser` → `{entries: [{rank, username, emoji, points, isViewer}], viewer: {rank, points}, nextOffset}`.
- `backend/internal/leaderboard/service_test.go` — `Award` validation; viewer without points gets a null rank; a user missing from `PublicByIDs` is left out.
- `backend/internal/leaderboard/store_test.go` (`//go:build integration`) — second identical award inserts nothing; equal totals share a rank and the next rank skips; ties keep user-id order across a page boundary; `RankOfUser` equals the viewer's rank in `RankedPage`; ledger rows vanish with their user; an award in a rolled-back tx leaves no row.
- `backend/internal/account/handler.go` — `GET /api/me` adds `points` from a `PointsTotaler` interface declared in `backend/internal/account/service.go`.
- `backend/cmd/what-the-flag/main.go` — wire leaderboard store, service, handler; pass it to the account handler.
- `frontend/src/features/leaderboard/` — `api.ts`, `messages.ts`, `LeaderboardPage.tsx` (ranks, emoji, names, points, previous/next, the viewer's row pinned when off-page), `LeaderboardPage.test.tsx`.
- `frontend/src/features/auth/api.ts` — `points` in the me schema; `frontend/src/features/profile/ProfilePage.tsx` — shows total points.
- `frontend/src/app/router.tsx` — `/leaderboard` under `RequireUser`.

### Acceptance criteria

- [ ] Award validation, the unranked viewer and missing users hold (service): `cd backend && go test -race ./internal/leaderboard -run TestService`
- [ ] Idempotency, `RANK()` ties and paging, cascade and tx rollback hold (integration): `cd backend && go test -tags=integration -race ./internal/leaderboard -run TestStore`
- [ ] An off-page viewer row is pinned below the page; an on-page viewer is marked, not repeated (frontend): `cd frontend && pnpm vitest run src/features/leaderboard/LeaderboardPage.test.tsx`
- [ ] `make check` passes
