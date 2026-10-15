# ADR 0003 — One agent and one provider adapter

The runtime is a single loop with typed tools, budgets, and approvals. There is no multi-agent orchestration in the first build.

`ModelProvider` is the extension point. The first adapter speaks the OpenAI-compatible chat completions API, including local servers that implement it. Further providers are new adapters, not new runtimes.
