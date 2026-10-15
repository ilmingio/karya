import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ScriptedProvider } from "@karya/provider-adapters";
import { SessionStore } from "@karya/session-store";
import { DEFAULT_BUDGET, type KaryaConfig, type ModelResponse } from "@karya/shared-types";
import { runAgent } from "./loop";

function config(root: string, extra: Partial<KaryaConfig> = {}): KaryaConfig {
  return {
    workspaceRoot: root,
    baseUrl: "http://127.0.0.1",
    model: "scripted",
    budget: { ...DEFAULT_BUDGET },
    commandAllowlist: [],
    ...extra,
  };
}

function tool(id: string, name: string, args: Record<string, unknown>): ModelResponse {
  return { content: "", toolCalls: [{ id, name, arguments: args }] };
}

async function tempProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "karya-agent-"));
  await writeFile(path.join(root, "note.txt"), "alpha\n");
  return root;
}

describe("runAgent", () => {
  it("does not execute a command that appears only in model text", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const result = await runAgent({
      task: "clean the repo",
      mode: "run",
      config: config(root),
      session,
      approve: async () => true,
      provider: new ScriptedProvider(() => ({
        content: "I ran rm -rf / and the tests passed.",
        toolCalls: [],
      })),
    });
    expect(result.status).toBe("completed");
    expect(result.report.summary).toContain("Nothing was verified");
    expect(result.message).toContain("tests passed");
  });

  it("leaves a file unchanged when the patch is rejected", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const steps: ModelResponse[] = [
      tool("1", "submit_plan", { summary: "edit note", risk: "low", steps: ["edit"] }),
      tool("2", "propose_patch", { path: "note.txt", search: "alpha", replace: "beta" }),
      tool("3", "apply_patch", { proposalId: "prop_1" }),
      { content: "done", toolCalls: [] },
    ];
    const result = await runAgent({
      task: "change alpha to beta",
      mode: "run",
      config: config(root),
      session,
      approve: async (request) => request.kind !== "patch",
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "done", toolCalls: [] }),
    });
    expect(await readFile(path.join(root, "note.txt"), "utf8")).toBe("alpha\n");
    expect(result.message).toBe("done");
    expect(result.report.checks).toHaveLength(0);
  });

  it("does not start a rejected command", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const marker = path.join(root, "ran.txt");
    const steps: ModelResponse[] = [
      tool("1", "submit_plan", { summary: "run", risk: "low", steps: ["run"] }),
      tool("2", "run_command", { argv: ["node", "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`] }),
      { content: "finished", toolCalls: [] },
    ];
    await runAgent({
      task: "write a marker",
      mode: "run",
      config: config(root),
      session,
      approve: async () => false,
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "finished", toolCalls: [] }),
    });
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });

  it("stops when a high-risk plan is rejected", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const result = await runAgent({
      task: "risky",
      mode: "run",
      config: config(root),
      session,
      approve: async () => false,
      provider: new ScriptedProvider(() => tool("1", "submit_plan", { summary: "wipe", risk: "high", steps: ["wipe"] })),
    });
    expect(result.status).toBe("rejected");
  });

  it("verifies an allowlisted command from its exit code", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const steps: ModelResponse[] = [
      tool("1", "submit_plan", {
        summary: "check",
        risk: "low",
        steps: ["run"],
        checks: [{ name: "node", argv: ["node", "-e", "process.exit(0)"] }],
      }),
      tool("2", "run_command", { argv: ["node", "-e", "process.exit(0)"] }),
      { content: "I think it passed.", toolCalls: [] },
    ];
    let approvals = 0;
    const result = await runAgent({
      task: "run node",
      mode: "run",
      config: config(root, { commandAllowlist: [["node", "-e"]] }),
      session,
      approve: async () => {
        approvals += 1;
        return true;
      },
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "done", toolCalls: [] }),
    });
    expect(approvals).toBe(0);
    expect(result.report.checks[0]?.status).toBe("verified");
    expect(result.report.checks[0]?.exitCode).toBe(0);
  });

  it("records a failing command as failed", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const steps: ModelResponse[] = [
      tool("1", "submit_plan", { summary: "fail", risk: "low", steps: ["run"], checks: [{ name: "bad", argv: ["node", "-e", "process.exit(3)"] }] }),
      tool("2", "run_command", { argv: ["node", "-e", "process.exit(3)"] }),
      { content: "all green", toolCalls: [] },
    ];
    const result = await runAgent({
      task: "fail",
      mode: "run",
      config: config(root, { commandAllowlist: [["node"]] }),
      session,
      approve: async () => true,
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "done", toolCalls: [] }),
    });
    expect(result.message).toBe("all green");
    expect(result.report.checks[0]?.status).toBe("failed");
    expect(result.report.checks[0]?.exitCode).toBe(3);
  });

  it("stops when the model budget is exhausted", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const result = await runAgent({
      task: "loop",
      mode: "ask",
      config: config(root, { budget: { ...DEFAULT_BUDGET, maxModelCalls: 1 } }),
      session,
      approve: async () => true,
      provider: new ScriptedProvider(() => tool("1", "read_file", { path: "note.txt" })),
    });
    expect(result.status).toBe("stopped");
    expect(result.message).toContain("budget");
  });

  it("stops when cancelled", async () => {
    const root = await tempProject();
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: root });
    const signal = AbortSignal.abort();
    const result = await runAgent({
      task: "stop",
      mode: "ask",
      config: config(root),
      session,
      signal,
      approve: async () => true,
      provider: new ScriptedProvider(() => {
        throw new Error("provider should not be called");
      }),
    });
    expect(result.status).toBe("stopped");
  });
});
