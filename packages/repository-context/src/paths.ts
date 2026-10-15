import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { KaryaError } from "@karya/shared-types";

export async function resolveWorkspace(input: string): Promise<string> {
  const abs = path.resolve(input);
  let root: string;
  try {
    root = await realpath(abs);
  } catch {
    throw new KaryaError(`Workspace does not exist: ${input}`, "bad_workspace");
  }
  const stats = await lstat(root);
  if (!stats.isDirectory()) {
    throw new KaryaError(`Workspace is not a directory: ${input}`, "bad_workspace");
  }
  return root;
}

export function logicalInside(root: string, requestPath: string): string {
  if (requestPath.includes("\0")) {
    throw new KaryaError("Invalid path.", "bad_path");
  }
  const abs = path.resolve(root, requestPath);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new KaryaError("Path escapes the workspace.", "path_escape");
  }
  return abs;
}

export async function guardedPath(root: string, requestPath: string): Promise<string> {
  const abs = logicalInside(root, requestPath);
  const rootReal = await realpath(root);
  const missing: string[] = [];
  let current = abs;

  while (true) {
    try {
      const real = await realpath(current);
      const rel = path.relative(rootReal, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new KaryaError("Path escapes the workspace.", "path_escape");
      }
      return path.join(real, ...missing.reverse());
    } catch (error) {
      if (error instanceof KaryaError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) {
        throw new KaryaError("Path escapes the workspace.", "path_escape");
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export function relativeTo(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  return rel === "" ? "." : rel.split(path.sep).join("/");
}
