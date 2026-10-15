import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStore } from "./index";

describe("SessionStore", () => {
  it("redacts secrets before writing the log", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "karya-session-"));
    const session = await SessionStore.create({
      workspaceRoot: directory,
      directory,
      secrets: ["super-secret-value"],
      id: "test-session",
    });
    await session.append("note", { text: "token super-secret-value" });
    const written = await readFile(session.filePath, "utf8");
    expect(written).toContain("[REDACTED]");
    expect(written).not.toContain("super-secret-value");
    expect(session.filePath).toContain("test-session.jsonl");
  });
});
