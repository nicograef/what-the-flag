# The image of the one-shot `migrate` service in docker-compose.prod.yml; its tag carries exactly the release's migrations.
# The base pin equals MIGRATE_VERSION in .github/workflows/ci.yml, which CI checks. Dependabot bumps only this file,
# so its PR bumps MIGRATE_VERSION and MIGRATE_SHA256 by hand.
FROM migrate/migrate:v4.20.1
COPY migrations /migrations
