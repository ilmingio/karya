# Roadmap

Karya is an open-source, local-first coding agent. The first milestone is one reliable loop: understand a repository, plan a change, edit with approval, run checks, and report evidence.

Dates are planning targets for one developer. They are not commitments.

## Repositories

| Repository | When | What it is |
| --- | --- | --- |
| `karya` | Now | Agent runtime, CLI, providers, verification |
| `karya-vscode` | After the agent is useful | Extension that calls this runtime inside an existing editor |
| `karya-studio` | After the extension is useful | Separate Code - OSS fork cloned from `microsoft/vscode` |

`microsoft/vscode` is not a dependency of this repository.

## Months 1–3 — Agent

Repository exploration, planning, approved edits, approved commands, git status, and verification reports. One agent, typed tools, budgets, and cancellation.

## Months 4–5 — Specs

Human-readable specs under `.karya/specs/<feature>/`: requirements, design, tasks, and verification. The final report maps acceptance criteria to checks that ran.

## Month 6 — Public alpha

Documented CLI, two model providers, a sample repository, known limitations, and a contribution process.

## Months 7–8 — `karya-vscode`

Sidebar, reviewable diffs, and a verification panel. The extension does not grow a second agent loop.

## Months 9–10 — `karya-studio`

Only if the CLI and extension are in use. Clone a reviewed Code - OSS release into its own repository. Review the MIT license, Microsoft branding and service terms, marketplace terms, and third-party notices before distribution.

## Months 11–12 — Release candidate

Regression tests, dependency and secret scanning, a security disclosure process, and a small evaluation set.

## Later

Hosted agents, team plans, and enterprise policy controls wait until someone will pay for them. Local editing stays useful without an account.

## Measures

Task completion, verification accuracy, human correction effort, time to a useful result, cost per successful task, repeat usage, installation success, and contribution activity. Set numeric targets only after a baseline exists.
