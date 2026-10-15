# ADR 0001 — Agent first, three repositories

Karya starts as this repository: a local CLI agent. `karya-vscode` will be a later extension in its own repository. `karya-studio` will be a later Code - OSS fork, created by cloning `microsoft/vscode` into a separate directory only after the agent and extension are worth maintaining.

This repository will not vendor the editor.
