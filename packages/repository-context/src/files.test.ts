import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles, readFileBounded, resolveWorkspace, searchText } from "./index";

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "karya-repo-"));
  await writeFile(path.join(root, ".gitignore"), "secret.txt\n");
  await writeFile(path.join(root, "README.md"), "unique-karya-token\n");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "app.ts"), "export const value = 1;\n");
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "hidden\n");
  await writeFile(path.join(root, "secret.txt"), "do not index\n");
  return root;
}

describe("repository context", () => {
  it("resolves a directory and rejects a missing path", async () => {
    const root = await workspace();
    await expect(resolveWorkspace(root)).resolves.toBe(await realpath(root));
    await expect(resolveWorkspace(path.join(root, "missing"))).rejects.toThrow(/does not exist/);
  });

  it("skips ignored and generated directories", async () => {
    const root = await workspace();
    const listed = await listFiles(root);
    expect(listed.files).toContain("src/app.ts");
    expect(listed.files).not.toContain("secret.txt");
    expect(listed.files.join("\n")).not.toContain("node_modules");
  });

  it("refuses paths that escape the workspace", async () => {
    const root = await workspace();
    const outside = path.join(tmpdir(), `karya-outside-${Date.now()}.txt`);
    await writeFile(outside, "outside");
    await symlink(outside, path.join(root, "linked.txt"));
    await expect(readFileBounded(root, "../package.json", 1000)).rejects.toThrow(/escapes/);
    await expect(readFileBounded(root, "linked.txt", 1000)).rejects.toThrow(/escapes/);
  });

  it("finds text in project files", async () => {
    const root = await workspace();
    const hits = await searchText(root, "unique-karya-token");
    expect(hits.some((hit) => hit.path === "README.md")).toBe(true);
  });
});
