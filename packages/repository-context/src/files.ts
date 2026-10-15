import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { guardedPath, relativeTo } from "./paths";
import { isIgnored, loadIgnore } from "./ignore";

const MAX_DEPTH = 20;

export async function listFiles(root: string, limit = 200): Promise<{ files: string[]; truncated: boolean }> {
  const rules = await loadIgnore(root);
  const files: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (truncated || depth > MAX_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= limit) {
        truncated = true;
        return;
      }
      const abs = path.join(dir, entry.name);
      const rel = relativeTo(root, abs);
      const parts = rel.split("/");
      if (parts.some((part) => part === "node_modules" || part === ".git" || part === "dist" || part === "coverage")) {
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (isIgnored(rules, rel, true)) continue;
        await walk(abs, depth + 1);
        continue;
      }
      if (!entry.isFile() || isIgnored(rules, rel, false)) continue;
      files.push(rel);
    }
  }

  await walk(root, 0);
  files.sort();
  return { files, truncated };
}

export async function readFileBounded(
  root: string,
  requestPath: string,
  maxBytes: number,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const abs = await guardedPath(root, requestPath);
  const stats = await lstat(abs);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Path is not a regular file.");
  }
  const handle = await readFile(abs);
  const truncated = handle.byteLength > maxBytes;
  const slice = truncated ? handle.subarray(0, maxBytes) : handle;
  return {
    path: relativeTo(root, abs),
    content: slice.toString("utf8"),
    truncated,
  };
}
