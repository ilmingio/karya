# Karya

Karya is a local-first coding agent. It reads a repository, plans a change, edits files only with approval, runs commands only with approval, and reports what it actually verified.

The tagline is: AI that doesn't just write code — it shows its work.

This repository is the agent. It does not contain a VS Code fork. An editor extension (`karya-vscode`) and a Code - OSS desktop app (`karya-studio`) are later, separate repositories.

## Requirements

- Node.js 22 or newer
- pnpm 10
- Git
- ripgrep (`rg`) is used when it is on `PATH`. Karya falls back to a file scan when it is not.

## Run from a checkout

```bash
pnpm install
pnpm karya -- --help
```

Ask a question about a repository:

```bash
export KARYA_API_KEY="your-key"
pnpm karya -- ask --root /path/to/project "How is configuration loaded?"
```

Run a coding task. File writes and commands stop for approval:

```bash
pnpm karya -- run --root /path/to/project "Add a subtract function and a test."
```

The provider is any OpenAI-compatible chat API.

| Variable | Purpose | Default |
| --- | --- | --- |
| `KARYA_API_KEY` | Bearer token. Never stored in the project. | unset |
| `KARYA_BASE_URL` | API origin, including `/v1` when required | `https://api.openai.com/v1` |
| `KARYA_MODEL` | Model name | `gpt-4o-mini` |

Optional project config lives in `.karya/config.json` and may set `baseUrl`, `model`, `budget`, and `commandAllowlist`. Karya refuses to start if that file contains an API key.

## What a run proves

A verification line is **verified** only when that command ran in the session and exited 0. A planned check that never ran is **unverified**. A non-zero exit is **failed**. The model's own summary is printed separately from this evidence.

## Development

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Tests use a scripted model provider. They do not call a live API.

## Safety

- Reads and writes stay inside the workspace, including symlink targets.
- `apply_patch` and `run_command` require approval unless the exact argv prefix is in `commandAllowlist`.
- Commands are an argv array. They are not passed through a shell.
- Model-call and tool-call budgets, plus a session timeout, stop a runaway loop.
- API keys are redacted from session logs.

## License

Apache License 2.0. See [LICENSE](LICENSE).
