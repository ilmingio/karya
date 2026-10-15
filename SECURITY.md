# Security policy

## Supported surface

The supported surface is the local CLI and agent runtime in this repository. Report issues that let a repository, model response, or tool argument do any of the following:

- read or write outside the selected workspace
- run a shell command without the approval the user thinks they gave
- leak API keys into logs, prompts, or session files
- mark a check verified when it did not exit 0

## Reporting

Do not open a public issue for an unfixed vulnerability. If this project is hosted on GitHub, use a private security advisory. Otherwise contact the maintainers privately and include a reproduction.

## Response

Maintainers acknowledge a report, confirm or reject it, and publish a fix note once a patch is available. There is no bounty program yet.

## Expectations for users

Treat repository contents as untrusted. Review diffs and commands before approving them. Keep `KARYA_API_KEY` in the environment, not in `.karya/config.json` or git.
