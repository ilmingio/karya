import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAgent } from "@karya/agent-runtime";
import { ScriptedProvider } from "@karya/provider-adapters";
import { SessionStore } from "@karya/session-store";
import { DEFAULT_BUDGET, type KaryaConfig, type ModelResponse } from "@karya/shared-types";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const fixture = path.join(repoRoot, "tests", "fixtures", "sample-ts");
const checkArgv = ["node", "--experimental-strip-types", "--test", "src/math.test.ts"];

function config(root: string): KaryaConfig {
  return {
    workspaceRoot: root,
    baseUrl: "http://127.0.0.1",
    model: "scripted",
    budget: { ...DEFAULT_BUDGET, timeoutMs: 20_000 },
    commandAllowlist: [],
  };
}

function tool(id: string, name: string, args: Record<string, unknown>): ModelResponse {
  return { content: "", toolCalls: [{ id, name, arguments: args }] };
}

function stripUntrusted(text: string): string {
  return text.replace(/^<untrusted>\n/, "").replace(/\n<\/untrusted>$/, "");
}

describe("evaluation tasks", () => {
  it("adds subtract to the sample project and verifies the test process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-sample-"));
    await cp(fixture, root, { recursive: true });
    const session = await SessionStore.create({ workspaceRoot: root, secrets: [], directory: path.join(root, "sessions") });
    const testFile = [
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'import { add, subtract } from "./math.ts";',
      "",
      'test("add", () => {',
      "  assert.equal(add(2, 3), 5);",
      "});",
      "",
      'test("subtract", () => {',
      "  assert.equal(subtract(5, 3), 2);",
      "});",
      "",
    ].join("\n");
    const steps: ModelResponse[] = [
      tool("1", "read_file", { path: "src/math.ts" }),
      tool("2", "submit_plan", {
        summary: "Add subtract and a test",
        risk: "low",
        steps: ["Read math.ts", "Add subtract", "Add a test", "Run the test"],
        checks: [{ name: "unit tests", argv: checkArgv }],
      }),
      tool("3", "propose_patch", {
        path: "src/math.ts",
        search: "return a + b;\n}\n",
        replace: "return a + b;\n}\n\nexport function subtract(a: number, b: number): number {\n  return a - b;\n}\n",
      }),
      tool("4", "apply_patch", { proposalId: "prop_1" }),
      tool("5", "propose_patch", { path: "src/math.test.ts", content: testFile }),
      tool("6", "apply_patch", { proposalId: "prop_2" }),
      tool("7", "run_command", { argv: checkArgv }),
      { content: "Subtract is implemented.", toolCalls: [] },
    ];

    const result = await runAgent({
      task: "Add a subtract function and a test.",
      mode: "run",
      config: config(root),
      session,
      approve: async () => true,
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "done", toolCalls: [] }),
    });

    const source = await readFile(path.join(root, "src", "math.ts"), "utf8");
    expect(source).toContain("export function subtract");
    expect(result.status).toBe("completed");
    expect(result.report.checks[0]).toMatchObject({ name: "unit tests", status: "verified", exitCode: 0 });
  });

  it("answers from a file it actually read in this repository", async () => {
    const session = await SessionStore.create({
      workspaceRoot: repoRoot,
      secrets: [],
      directory: await mkdtemp(path.join(tmpdir(), "karya-session-")),
    });
    const provider = new ScriptedProvider((messages) => {
      const tools = messages.filter((message) => message.role === "tool");
      if (tools.length === 0) {
        return tool("1", "search_text", { query: "Submit a plan before proposing patches" });
      }
      const latest = tools[tools.length - 1];
      if (!latest || latest.role !== "tool") return { content: "missing", toolCalls: [] };
      if (tools.length === 1) {
        const hits = JSON.parse(stripUntrusted(latest.content)) as Array<{ path: string }>;
        const found = hits.find((hit) => hit.path.endsWith("prompt.ts"))?.path;
        if (!found) return { content: "no hits", toolCalls: [] };
        return tool("2", "read_file", { path: found });
      }
      const file = JSON.parse(stripUntrusted(latest.content)) as { content: string };
      const line = file.content.split("\n").find((entry) => entry.includes("Submit a plan before proposing patches"));
      return { content: line ? `Grounded: ${line}` : "missing line", toolCalls: [] };
    });

    const result = await runAgent({
      task: "Where does Karya require a plan before edits?",
      mode: "ask",
      config: config(repoRoot),
      session,
      approve: async () => {
        throw new Error("ask mode should not request approval");
      },
      provider,
    });

    expect(result.status).toBe("completed");
    expect(result.message).toContain("Submit a plan before proposing patches");
    const prompt = await readFile(path.join(repoRoot, "packages", "agent-runtime", "src", "prompt.ts"), "utf8");
    expect(prompt).toContain("Submit a plan before proposing patches");
  });

  it("reports a real command in this repository from its exit code", async () => {
    const session = await SessionStore.create({
      workspaceRoot: repoRoot,
      secrets: [],
      directory: await mkdtemp(path.join(tmpdir(), "karya-session-")),
    });
    const argv = ["node", "-e", "console.log('karya-ok')"];
    const steps: ModelResponse[] = [
      tool("1", "git_status", {}),
      tool("2", "submit_plan", {
        summary: "Print a marker",
        risk: "low",
        steps: ["Check git", "Print a marker"],
        checks: [{ name: "marker", argv }],
      }),
      tool("3", "run_command", { argv }),
      { content: "Marker command finished.", toolCalls: [] },
    ];
    const result = await runAgent({
      task: "Print karya-ok without changing files.",
      mode: "run",
      config: config(repoRoot),
      session,
      approve: async () => true,
      provider: new ScriptedProvider(() => steps.shift() ?? { content: "done", toolCalls: [] }),
    });

    expect(result.report.checks[0]).toMatchObject({ status: "verified", exitCode: 0 });
    expect(result.report.checks[0]?.outputExcerpt).toContain("karya-ok");
  });
});
