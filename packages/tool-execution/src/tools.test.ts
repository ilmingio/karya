import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposal, proposePatch } from "./patch";
import { isAllowlisted, runCommand } from "./command";

describe("patches", () => {
  it("shows a diff and writes only when applied", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-patch-"));
    await writeFile(path.join(root, "math.js"), "export function add(a, b) {\n  return a + b;\n}\n");
    const proposal = await proposePatch(
      root,
      { path: "math.js", search: "return a + b;", replace: "return a + b + 0;" },
      10_000,
      "prop_1",
    );
    expect(proposal.diff).toContain("return a + b + 0;");
    expect(await readFile(path.join(root, "math.js"), "utf8")).toContain("return a + b;");
    await applyProposal(root, proposal);
    expect(await readFile(path.join(root, "math.js"), "utf8")).toContain("return a + b + 0;");
  });

  it("rejects an ambiguous search and a path outside the workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-patch-"));
    await writeFile(path.join(root, "a.txt"), "one one");
    await expect(proposePatch(root, { path: "a.txt", search: "one", replace: "two" }, 1000, "prop_1")).rejects.toThrow(/more than once/);
    await expect(proposePatch(root, { path: "../nope.txt", content: "x" }, 1000, "prop_2")).rejects.toThrow(/escapes|relative/);
  });
});

describe("commands", () => {
  it("matches an argv prefix and captures a real exit code", async () => {
    expect(isAllowlisted(["pnpm", "test", "--watch"], [["pnpm", "test"]])).toBe(true);
    expect(isAllowlisted(["pnpm", "install"], [["pnpm", "test"]])).toBe(false);
    const root = await mkdtemp(path.join(tmpdir(), "karya-cmd-"));
    const result = await runCommand({
      root,
      argv: ["node", "-e", "process.exit(0)"],
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(0);
  });

  it("times out a stuck process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-cmd-"));
    const result = await runCommand({
      root,
      argv: ["node", "-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 200,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
});
