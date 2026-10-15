# Product brief

## User

Individual developers and small teams who already use an editor and want an agent that can show what it verified.

## Job

Given a repository and a task, produce a reviewable change and an honest report of which checks ran.

## In the first release

- CLI on macOS, with portable file, git, and process code
- One OpenAI-compatible provider, bring your own key
- Repository search, read, plan, patch, command, git status
- Approval for writes and commands
- A verification report based on exit codes

## Out of the first release

- VS Code extension and Code - OSS fork
- Spec engine, embeddings, multi-agent runs, accounts, and billing

## Demo scenario

In `tests/fixtures/sample-ts`, ask Karya to add `subtract` and a test. The run shows a diff, waits for approval, executes `node --experimental-strip-types --test`, and reports that check as verified only if the process exits 0.

## Why use it

Karya separates the model's story from the commands that actually ran, so a developer can see whether the change was checked.
