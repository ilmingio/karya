# ADR 0004 — Local files, not a hosted store

Sessions are append-only JSONL files under `.karya/sessions/`. Configuration that is safe to share can live in `.karya/config.json`. API keys stay in the environment.

SQLite and a hosted backend wait until a query or a cloud product needs them. Specs, when they exist, will be Markdown and JSON in the project so people can read them without Karya.
