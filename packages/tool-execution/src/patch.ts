import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { KaryaError } from "@karya/shared-types";
import { guardedPath, relativeTo } from "@karya/repository-context";

export interface Proposal {
  id: string;
  path: string;
  diff: string;
  nextContent: string;
  baseHash: string;
}

export interface PatchInput {
  path: string;
  search?: string;
  replace?: string;
  content?: string;
}

function hashContent(content: string | null): string {
  if (content === null) return "missing";
  return createHash("sha256").update(content).digest("hex");
}

async function readCurrent(root: string, requestPath: string): Promise<{ abs: string; rel: string; content: string | null }> {
  const abs = await guardedPath(root, requestPath);
  const rel = relativeTo(root, path.resolve(root, requestPath));
  try {
    const stats = await lstat(abs);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new KaryaError("Path is not a regular file.", "bad_path");
    }
    return { abs, rel, content: await readFile(abs, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { abs, rel, content: null };
    }
    throw error;
  }
}

export async function proposePatch(
  root: string,
  input: PatchInput,
  maxBytes: number,
  id: string,
): Promise<Proposal> {
  if (!input.path || path.isAbsolute(input.path)) {
    throw new KaryaError("Patch path must be a relative workspace path.", "bad_path");
  }
  const current = await readCurrent(root, input.path);
  let nextContent: string;
  if (typeof input.content === "string") {
    nextContent = input.content;
  } else if (typeof input.search === "string" && typeof input.replace === "string") {
    if (current.content === null) {
      throw new KaryaError("Cannot search a file that does not exist.", "patch_mismatch");
    }
    const occurrences = current.content.split(input.search).length - 1;
    if (occurrences === 0) {
      throw new KaryaError("Search text was not found.", "patch_mismatch");
    }
    if (occurrences > 1) {
      throw new KaryaError("Search text matched more than once. Narrow the search.", "patch_mismatch");
    }
    nextContent = current.content.replace(input.search, input.replace);
  } else {
    throw new KaryaError("Provide content for a new file, or search and replace.", "bad_args");
  }

  if (Buffer.byteLength(nextContent) > maxBytes) {
    throw new KaryaError("Replacement exceeds the file size budget.", "budget");
  }

  const diff = createTwoFilesPatch(
    current.rel,
    current.rel,
    current.content ?? "",
    nextContent,
    "",
    "",
    { context: 3 },
  );

  return {
    id,
    path: current.rel,
    diff,
    nextContent,
    baseHash: hashContent(current.content),
  };
}

export async function applyProposal(root: string, proposal: Proposal): Promise<void> {
  const current = await readCurrent(root, proposal.path);
  if (hashContent(current.content) !== proposal.baseHash) {
    throw new KaryaError("File changed since the diff was proposed.", "patch_stale");
  }
  await mkdir(path.dirname(current.abs), { recursive: true });
  await writeFile(current.abs, proposal.nextContent, "utf8");
}
