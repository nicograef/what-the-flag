# Decisions

Durable architecture decisions the PRD does not state. A replaced line gets `replaced by DNN`.

- D01: The Origin check compares the `Origin` host and port with the `Host` header; there is no allow-list. Caddy and the Vite proxy keep `Host`, so no setting is needed.
- D02: The flag key is a reversible hash of the country code, obfuscation only. The server clock is the anti-cheat, so a cheap scheme suffices.
- D03: UI texts are typed `{de, en}` message objects; there is no i18n library. Two fixed languages and a few hundred strings need no extraction or ICU tooling.
- D04: The API sends `{de, en}` texts and never negotiates language. A switch re-renders without a request, and query keys carry no locale.
- D05: Contract tests are Go HTTP tests on the real handler chain; there is no OpenAPI document. The only client ships in the same release, so a document has no reader.
- D06: Each domain has its own sqlc package inside its internal tree. Go's internal rule stops one module from calling another module's queries.
- D07: A store that opens transactions takes sqlc's DBTX plus Begin, a read-only store only DBTX, never a pool; integration tests never truncate. Aggregate tests run in a rolled-back transaction, so parallel packages share one database.
- D08: A method that takes a transaction rejects a nil one. A silent second transaction would break the caller's atomicity.
- D09: Questions are generated when first served and stored per quiz. A shared quiz stays identical, and stored questions show where people fail.
- D10: The client key is the last `X-Forwarded-For` hop, IPv6 per /64. Caddy sets that hop from the client connection, and one home or school network holds one /64.
- D11: The e2e stack runs `docker-compose.prod.yml` with Caddy local certificates, not the dev stack. It tests the real site blocks and the Origin check with a port.
- D12: The edge's Content-Security-Policy allows only same-origin files plus `data:` images and fonts, without `'unsafe-inline'`. Vite emits no inline script or style, and React `style` props bypass `style-src`.
- D13: The catalogue is an embedded artefact built by the importer; Postgres holds only what play produces. Catalogue tables would add a seed path, a migration per data edit and a second source of truth.
