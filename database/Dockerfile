# The image of the one-shot `migrate` service in docker-compose.prod.yml; its tag carries exactly the release's migrations.
# The base pin equals MIGRATE_VERSION in .github/workflows/ci.yml; a Dependabot bump updates both.
FROM migrate/migrate:v4.20.1
COPY migrations /migrations
