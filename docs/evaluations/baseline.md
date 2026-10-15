# First evaluation baseline

Recorded from the scripted test suite. No live model provider was called, so these results measure the runtime, not a particular model.

| Task | Workspace | Result |
| --- | --- | --- |
| Add `subtract` and a test | Copy of `tests/fixtures/sample-ts` | Verified. `node --experimental-strip-types --test src/math.test.ts` exited 0. |
| Answer where a plan is required | This repository, read-only | Completed. The answer quoted a line read from `packages/agent-runtime/src/prompt.ts`. |
| Print `karya-ok` | This repository, no file changes | Verified. `node -e` exited 0 and the report included the process output. |

Failures in this run: none.

Not yet measured: task completion with a live model, human correction effort, time to a useful result, and cost per task. Those need `KARYA_API_KEY` and a few real tasks after this baseline.

Next sprint: run the same three tasks through the OpenAI-compatible adapter and record where the model drifts from the plan, the diff, or the checks.
