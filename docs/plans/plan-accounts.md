# Plan: Accounts and sessions

> Source PRD: docs/prds/prd-rebuild.md (sections "Accounts", HTTP contract, Frontend)

## Goal

A visitor registers with a username and password and stays logged in for 30 sliding days.
A user logs in and out, changes their emoji, deletes their account and searches other users by name prefix.
Package `account` exports the auth and lookup functions the duels plan builds on.

## Architectural decisions

- **Case-insensitive usernames**: `UNIQUE INDEX users_username_lower_key ON users (lower(username) text_pattern_ops)`. No citext: it needs an extension and a type override. Usernames are ASCII, so `lower()` is exact. The index serves equality and prefix `LIKE`. The stored username keeps its case for display.
- **Username rule**: `^[A-Za-z0-9_]{3,20}$`, also a `CHECK` on the column. Usernames are immutable.
- **Usernames are public**: search lists them to every user, so registration answers `username_taken` openly. Login answers unknown user and wrong password alike.
- **Password rule**: 8 to 128 Unicode code points. Go counts `utf8.RuneCountInString`; Zod counts `[...value].length`.
- **Hashing**: `backend/internal/account/password.go` ports jotti `backend/domain/user/password.go` (`createArgon2idHash`, `parseArgon2Hash`, `verifyPassword`). PHC string, 16-byte salt, 32-byte key, `crypto/subtle — ConstantTimeCompare()`.
  - Parameters per the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) (Argon2id): m=19456 KiB, t=2, p=1. Verification reads them from the stored string.
  - The service holds them in an unexported `params` field. Service tests (package `account`) set m=64, t=1 after `NewService`.
- **Hash gate**: a buffered-channel semaphore of `maxConcurrentHashes = 4` guards every hash and verify. Waiting honours `ctx`; a cancelled request returns without hashing.
- **Login timing**: `NewService` hashes a fixed string once as the dummy hash. Login for an unknown username verifies against it. A login password outside 1–128 code points is rejected before any lookup or hash.
- **Sessions**: token = 32 bytes from `crypto/rand`, base64url in the cookie. `sessions.token_hash` (its SHA-256) is the primary key. Lifetime 30 days.
  - A request whose session's `last_seen_at` lies over one hour back sets `last_seen_at = now`, `expires_at = now + 30 d` and re-sends the cookie.
  - An expired session is deleted on lookup. Register and login delete all expired sessions.
- **No session fixation**: the server alone mints tokens. Register and login always create a fresh session and delete a session cookie presented on that request.
- **Cookie**: `__Host-session=<token>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`, no `Domain`. Logout, deletion and a 401 for a presented unknown or expired token send it with `Max-Age=0`.
- **Dev cookies**: browsers treat `http://localhost` as a secure context and keep `__Host-` cookies there. Phase 1 proves the attributes with `curl -si` through the Vite proxy.
- **Rate limit** (jotti `backend/api/middleware/middleware.go — RateLimitMiddleware`, `clientIP`): `backend/internal/account/ratelimit.go`.
  - One `golang.org/x/time/rate` limiter per client key in a mutex-guarded map, each entry with `lastSeen`. A goroutine prunes entries idle over 10 minutes every 5 minutes.
  - Client key: the rightmost `X-Forwarded-For` entry, else the peer host of `r.RemoteAddr`. An IPv6 address is keyed by its /64 prefix.
  - The limiter takes the injected clock through `AllowN(now, 1)`. Every attempt counts. A denied request gets `429 rate_limited`.
  - `POST /api/accounts`: burst 10, one token per minute. `POST /api/session`: burst 20, one token per 10 s. Bursts fit a school class behind one NAT.
- **Exports for other domains**:
  - `(h *account.Handler) RequireUser(next http.Handler) http.Handler` answers `401 unauthenticated` or calls `next` with the user id in the context.
  - `account.UserID(ctx context.Context) uuid.UUID` reads it and panics outside `RequireUser`.
  - `(h *account.Handler) OptionalUser(r *http.Request) (uuid.UUID, bool)` resolves a valid session without sliding or writing. Duels 1 wires it as quiz's viewer.
  - `account.PublicUser{ID uuid.UUID; Username, Emoji string}`.
  - `(s *account.Service) PublicByIDs(ctx, ids []uuid.UUID) (map[uuid.UUID]PublicUser, error)`; unknown ids are absent from the map.
  - `(s *account.Service) IDByUsername(ctx, username string) (uuid.UUID, error)`, any letter case; `account.ErrUserNotFound` when absent.
- **Wiring**: `backend/internal/app/app.go — New()` builds the account store, service and handler and calls `Register(mux)`.
- **Errors**: the handler's `httpx.MapError` table is the error table below. `message` stays a short English developer text.
- **Emoji list**: `backend/internal/account/emoji.go — Emojis`, 24 animal emoji. Registration picks one with the injected `func(n int) int`. `GET /api/me` returns the list as `emojis`, so the frontend holds no copy.
- **Me body**: `{username, emoji, emojis}`. Duels 4 adds `points`; this plan's profile shows no points.
- **User search**: `query` is 1–20 characters of the username alphabet, else `400 invalid_query`. The service escapes `_` before `lower(username) LIKE $1 || '%'`. Results exclude the caller, sort by `lower(username)` and stop at 20. No pagination.
- **Account deletion**: one `DELETE FROM users`. FK cascades remove sessions and rounds. Duels and ledger rows follow the PRD rule "Deleting an account removes …" through duels' own migrations.
- **Redirects**: a logged-out visitor on a player route goes to `/login?next=<path>`.
  - After login or registration the app goes to `next` if it starts with `/` but not `//`, else `AFTER_LOGIN = '/'`. Duels 3 switches the constant to `/dashboard`.
  - A logged-in user on `/login` or `/register` goes to `AFTER_LOGIN`. Logout and deletion clear the query cache and go to `/`.
- **Protected routes**: `frontend/src/features/auth/require-user.tsx — RequireUser` is a layout route element rendering `<Outlet />`. Every player route in `router.tsx` is its child.
- **Session query**: `frontend/src/features/auth/use-session.ts — useSession()`, query key `['session']`, calls `GET /api/me`; a 401 resolves to `null`.
- **Feature API shape**: plain functions `(api: ApiClient, …args) => Promise<T>` with Zod schemas, plus hooks that call `useApiClient()`.
- **Forms**: shadcn form components with `react-hook-form` and `@hookform/resolvers/zod`, per [shadcn forms](https://ui.shadcn.com/docs/forms/react-hook-form) at execution.
- **Messages**: each feature's `messages.ts` uses `defineMessages` and maps only its own error codes; a `field` puts the message under that input. `rate_limited` and `unauthenticated` show through `errorMessage()`.
- **Frontend tests**: `renderRoute(path, { api })` with a `FakeApi`; nothing else fakes the server. The landing's log-in and register links are the navbar's `UserMenu`.

### Error codes

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

### Schema

`database/migrations/000003_accounts.up.sql`, wrapped in `BEGIN; … COMMIT;`:

- `users(id uuid PK DEFAULT uuidv7(), username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'), password_hash text NOT NULL, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())` plus the unique index above. `created_at` is audit-only, so `now()` is fine.
- `sessions(token_hash bytea PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, created_at, last_seen_at, expires_at timestamptz NOT NULL)`; indexes on `user_id` and `expires_at`. Session times come from the injected clock.
- `ALTER TABLE rounds ADD FOREIGN KEY (user_id) REFERENCES users ON DELETE CASCADE`. Practice rounds hold `NULL` and stay valid.

## Inventory

- `backend/internal/app/app.go — New()` — handler chain and domain wiring; each phase adds its routes here.
- `backend/internal/httpx/ — ReadJSON(), WriteJSON(), WriteError(), MapError(), Logger()` — envelope, Origin check, 415 and body limit.
- `backend/internal/postgres/testpool.go — TestPool(), TestTx()` — integration-test pool and rolled-back tx.
- `backend/sqlc.yaml` — gains an `account` block: `sqlc/queries/account.sql`, `out: internal/account/internal/db`. Regenerate with `cd backend && go tool sqlc generate`. Stores take `DB`: sqlc's `DBTX` plus `Begin` (foundation).
- `backend/internal/contract/harness_integration_test.go — newServer(), newClient(), decode(), expectError()` — TLS server over `app.New`, one cookie jar and `X-Forwarded-For` per client.
- `database/migrations/000002_quiz.up.sql — rounds` — target of the `user_id` foreign key.
- `frontend/src/lib/api.ts — ApiClient, ApiError, useApiClient()`; `frontend/src/lib/query-client.ts — createQueryClient()`.
- `frontend/src/lib/i18n/ — defineMessages()`; `frontend/src/lib/i18n/error-messages.ts — errorMessage()`.
- `frontend/src/app/router.tsx` — route table; `frontend/src/app/navbar.tsx — Navbar`.
- `frontend/src/test/fake-api.ts — FakeApi`, `frontend/src/test/render.tsx — renderRoute()`, `frontend/src/test/setup.ts` (Radix polyfills).
- Library versions resolve at execution: `go get <module>@latest` in `backend/`, `pnpm add <pkg>` in `frontend/`, shadcn components via `pnpm dlx shadcn@latest add <component>`.
- This plan edits no `Makefile` and no `.github/workflows/*`. Integration tests need `make db` and `make db-migrate` first.

## Open questions / Risks

- **Login throttling is per address only** (PRD). Guessing one account from many addresses is bounded only by the hash gate. Accepted for a game without personal data.
- **Forwarded header trust**: the backend trusts the rightmost `X-Forwarded-For` entry. Production publishes no backend port, so every request passes Caddy, which sets it.
- **Hash cost in tests**: argon2id at OWASP cost is slow under `-race`. Contract rate-limit cases send input rejected before any hash.

## Phase 1: Register and stay logged in

**Depends on**: none

### Context

- `database/migrations/000003_accounts.up.sql` — new, the schema above.
- `backend/sqlc.yaml` — the `account` block; `backend/sqlc/queries/account.sql` — new: `CreateUser`, `GetUserByID`, `CreateSession`, `GetSessionByTokenHash`, `TouchSession`, `DeleteSession`, `DeleteExpiredSessions`; generated `backend/internal/account/internal/db/`.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/crypto`.

### What to build

- `backend/internal/account/password.go` — the jotti port with OWASP parameters, the hash gate, `hashPassword()`, `verifyPassword()`.
- `backend/internal/account/emoji.go` — `Emojis`.
- `backend/internal/account/service.go` — `Service`, `Store` interface, `NewService(store, now func() time.Time, intn func(int) int)`, `Register()`, `Authenticate(tokenHash)` with sliding and expiry, username and password rules.
- `backend/internal/account/store.go` — `DB`, `NewStore(d DB)`; maps the unique violation on `users_username_lower_key` to `ErrUsernameTaken`.
- `backend/internal/account/handler.go` — `NewHandler`, `Register(mux)`, `POST /api/accounts` (201, cookie, me body), `GET /api/me`, `RequireUser()`, `UserID()`, `OptionalUser()`, cookie helpers, the `MapError` table.
- `backend/internal/account/password_test.go` — hash round trip; malformed PHC strings rejected; wrong password fails.
- `backend/internal/account/service_test.go` — in-memory fake store and fixed clock: username and password rule tables, expiry after 30 idle days, sliding after one hour, a presented session deleted on register.
- `backend/internal/account/store_integration_test.go` — `TestStoreSessions`: lookup by hash, touch, and `DeleteExpiredSessions` removes only expired rows of this test's users.
- `backend/internal/app/app.go` — wire account store, service and handler.
- `backend/internal/contract/harness_integration_test.go` — `registerUser(t, srv)`: a fresh `newClient` registered under a unique username, so logged in; returns the client and the username.
- `backend/internal/contract/accounts_integration_test.go` — `TestAccountsRegister`:
  - register is 201; the raw `Set-Cookie` header holds `__Host-session`, `Path=/`, `Max-Age=2592000`, `HttpOnly`, `Secure`, `SameSite=Lax` and no `Domain`;
  - `GET /api/me` with the cookie returns the me body; without it 401 `unauthenticated`; an unknown token gets 401 and `Max-Age=0`;
  - `Alice` then `alice` is 409 `username_taken`; a bad username and a short password are 400 with their field.
- `frontend/src/features/auth/` — `api.ts` (`register()`, `getMe()`), `schemas.ts` (Zod username and password rules), `messages.ts`, `use-session.ts`, `register-page.tsx`, `register-page.test.tsx`.
- `frontend/src/features/auth/user-menu.tsx` — emoji and username linking to `/profile`; logged out, log-in and register links.
- `frontend/src/components/ui/` — `field.tsx`, `input.tsx`, `button.tsx`, `label.tsx`, `card.tsx` via the shadcn CLI where missing; `frontend/package.json`, `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/register`; `frontend/src/app/navbar.tsx` — mount `UserMenu`.

### Acceptance criteria

- [ ] With `make db` running: `make db-migrate && test "$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT version, dirty FROM schema_migrations"')" = '3|f'`
- [ ] `cd backend && go tool sqlc diff` exits 0.
- [ ] `cd backend && go test -race ./internal/account -run 'TestPassword|TestService'` exits 0.
- [ ] With `make db` and `make db-migrate` done, `make be-integration` exits 0; it runs `TestStoreSessions` and `TestAccountsRegister`.
- [ ] `cd frontend && pnpm vitest run src/features/auth/register-page.test.tsx` exits 0: invalid input shows field messages without a request, a valid submit posts `/api/accounts`, `username_taken` shows under the field.
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running, `curl -si -X POST localhost:5173/api/accounts -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' -d "{\"username\":\"curl_$RANDOM\",\"password\":\"correct-horse\"}" | grep -qiE '^set-cookie: __Host-session=[^;]+; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax'` exits 0.
- [ ] `make check` passes.

## Phase 2: Log in, log out, rate limits and protected routes

**Depends on**: 1

### Context

- `backend/internal/account/service.go — Register()`, `Authenticate()` — login reuses the password and session code.
- `backend/sqlc/queries/account.sql` — add `GetUserByUsernameLower`; regenerate.
- `backend/go.mod`, `backend/go.sum` — add `golang.org/x/time`.
- jotti `backend/api/middleware/middleware.go — RateLimitMiddleware, clientIP` — the limiter shape.

### What to build

- `backend/internal/account/service.go` — `Login()` with the dummy-hash path and presented-session deletion, `Logout()`.
- `backend/internal/account/ratelimit.go` — limiter map with `lastSeen`, `prune(now)`, the pruning goroutine, `clientIP(r)` with /64 keying, the middleware.
- `backend/internal/account/ratelimit_test.go` — burst then deny, refill, separate keys, one IPv6 /64 shares a bucket. `prune` drops idle entries. `clientIP` table: no XFF, single, chained, IPv6.
- `backend/internal/account/handler.go` — `POST /api/session` (200, cookie, me body), `DELETE /api/session` (no auth; deletes the presented session if any; always 204 with the cookie cleared), limiters on both POSTs.
- `backend/internal/account/service_test.go` — login with wrong password, unknown user, overlong and empty password, mixed-case username; a presented session is deleted.
- `backend/internal/contract/accounts_integration_test.go` — `TestAccountsSession`:
  - login in another letter case is 200 with a fresh cookie; a wrong password is 401 `invalid_credentials`;
  - logout is 204 with `Max-Age=0`, and `GET /api/me` is then 401;
  - from one address, the 11th registration with a bad username is 429 `rate_limited`;
  - likewise the 21st login with an empty password.
- `frontend/src/features/auth/` — `api.ts` (`login()`), `login-page.tsx`, `require-user.tsx`, `redirects.ts` (`safeNext()`, `AFTER_LOGIN`), `login-page.test.tsx`; `register-page.tsx` gains the `next` and logged-in redirects.
- `frontend/src/lib/i18n/error-messages.ts` — add `rate_limited` only if the generic map lacks it.
- `frontend/src/app/router.tsx` — `/login`; the `RequireUser` layout route. Phase 3's `/profile` is its first child.

### Acceptance criteria

- [ ] `cd backend && go test -race ./internal/account -run 'TestLimiter|TestClientIP|TestServiceLogin'` exits 0.
- [ ] With `make db` and `make db-migrate` done, `make be-integration` exits 0; it runs `TestAccountsSession`.
- [ ] `cd frontend && pnpm vitest run src/features/auth/login-page.test.tsx` exits 0: invalid input blocks the request, `invalid_credentials` and `rate_limited` show their messages, success goes to a safe `next`, `//evil` goes to `/`.
- [ ] `make check` passes.

## Phase 3: Profile, emoji and account deletion

**Depends on**: 2

### Context

- `backend/internal/account/handler.go — RequireUser()` — guards the new routes.
- `backend/sqlc/queries/account.sql` — add `UpdateUserEmoji`, `DeleteUser`; regenerate.
- `frontend/src/features/auth/require-user.tsx — RequireUser` — wraps `/profile`.

### What to build

- `backend/internal/account/service.go` — `SetEmoji()` validating against `Emojis`, `Delete()`.
- `backend/internal/account/handler.go` — `PATCH /api/me` (`{emoji}` → me body), `DELETE /api/me` (204, cookie cleared).
- `backend/internal/account/store_integration_test.go` — `TestStoreDeleteUser`: a user's sessions and a user round (fixture `quiz_sets` and `rounds` rows by plain SQL) vanish with the user.
- `backend/internal/contract/accounts_integration_test.go` — `TestAccountsProfile`: a listed emoji is stored and returned; another is 400 `invalid_emoji`; `DELETE /api/me` is 204, then `GET /api/me` and login are 401.
- `frontend/src/features/auth/api.ts` — `logout()`.
- `frontend/src/features/profile/` — `api.ts` (`updateEmoji()`, `deleteAccount()`), `messages.ts`, `profile-page.tsx` (username, emoji grid picker, log-out button, delete with a confirmation dialog), `profile-page.test.tsx`.
- `frontend/src/components/ui/alert-dialog.tsx` via the shadcn CLI; `frontend/package.json`, `frontend/pnpm-lock.yaml`.
- `frontend/src/app/router.tsx` — `/profile` under `RequireUser`.

### Acceptance criteria

- [ ] With `make db` and `make db-migrate` done, `make be-integration` exits 0; it runs `TestStoreDeleteUser` and `TestAccountsProfile`.
- [ ] `cd frontend && pnpm vitest run src/features/profile/profile-page.test.tsx` exits 0: logged out, `/profile` goes to `/login?next=%2Fprofile`; picking an emoji patches `/api/me` and updates the navbar; log-out and confirmed deletion go to `/`; cancelling deletes nothing.
- [ ] `make check` passes.

## Phase 4: User search and public lookups

**Depends on**: 3

### Context

- `backend/sqlc/queries/account.sql` — add `SearchUsersByPrefix` (excludes the caller, ordered by `lower(username)`, `LIMIT 20`) and `GetUsersByIDs`; regenerate.
- `backend/sqlc/queries/account.sql — GetUserByUsernameLower` — reused by `IDByUsername()`.

### What to build

- `backend/internal/account/service.go` — `Search()` with the query rule and `LIKE` escaping; `PublicUser`, `PublicByIDs()`, `IDByUsername()`, `ErrUserNotFound`.
- `backend/internal/account/handler.go` — `GET /api/users?query=` → `{users: [{username, emoji}]}`.
- `backend/internal/account/store_integration_test.go` — `TestStoreSearch` under a fresh random prefix: any-case match, `_` matches only itself, caller excluded, 21 matches return 20. `GetUsersByIDs` skips unknown ids; `GetUserByUsernameLower` finds any case.
- `backend/internal/contract/accounts_integration_test.go` — `TestAccountsSearch`: of two users sharing a fresh prefix, the caller finds the other, never itself; `query=a-b` is 400 `invalid_query`.
- The duels plan builds the frontend consumer.

### Acceptance criteria

- [ ] With `make db` and `make db-migrate` done, `make be-integration` exits 0; it runs `TestStoreSearch` and `TestAccountsSearch`.
- [ ] `make check` passes.
