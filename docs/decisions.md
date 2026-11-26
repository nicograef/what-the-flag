# Decisions

Durable architecture decisions the PRD does not state. A replaced line gets `replaced by DNN`.

- D01: The Origin check compares the `Origin` host and port with the `Host` header; there is no allow-list. Caddy and the Vite proxy keep `Host`, so no setting is needed.
- D02: The flag key is a reversible hash of the country code, obfuscation only. The server clock is the anti-cheat, so a cheap scheme suffices.
- D03: UI texts are typed `{de, en}` message objects; there is no i18n library. Two fixed languages and a few hundred strings need no extraction or ICU tooling.
- D04: The API sends `{de, en}` texts and never negotiates language. A switch re-renders without a request, and query keys carry no locale.
- D05: Contract tests are Go HTTP tests on the real handler chain; there is no OpenAPI document. The only client ships in the same release, so a document has no reader.
- D06: Each domain has its own sqlc package inside its internal tree. Go's internal rule stops one module from calling another module's queries.
- D07: Stores take sqlc's DBTX plus Begin, not a pool; integration tests never truncate. Aggregate tests run in a rolled-back transaction, so parallel packages share one database.
- D08: A method that takes a transaction rejects a nil one. A silent second transaction would break the caller's atomicity.
