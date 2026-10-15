import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BUDGET, KaryaError, type Budget, type KaryaConfig } from "@karya/shared-types";

const FORBIDDEN_KEYS = new Set(["apikey", "api_key", "token", "secret", "password"]);

interface FileConfig {
  baseUrl?: string;
  model?: string;
  budget?: Partial<Budget>;
  commandAllowlist?: string[][];
}

export async function loadConfig(workspaceRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<KaryaConfig> {
  const fileConfig = await readProjectConfig(workspaceRoot);
  const budget = { ...DEFAULT_BUDGET, ...fileConfig.budget };
  return {
    workspaceRoot,
    apiKey: env.KARYA_API_KEY || undefined,
    baseUrl: env.KARYA_BASE_URL || fileConfig.baseUrl || "https://api.openai.com/v1",
    model: env.KARYA_MODEL || fileConfig.model || "gpt-4o-mini",
    budget,
    commandAllowlist: fileConfig.commandAllowlist ?? [],
  };
}

async function readProjectConfig(workspaceRoot: string): Promise<FileConfig> {
  const file = path.join(workspaceRoot, ".karya", "config.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new KaryaError(
        "Refusing to read secrets from .karya/config.json. Set KARYA_API_KEY in the environment.",
        "config_secret",
      );
    }
  }

  const config: FileConfig = {};
  if (typeof parsed.baseUrl === "string") config.baseUrl = parsed.baseUrl;
  if (typeof parsed.model === "string") config.model = parsed.model;
  if (parsed.budget && typeof parsed.budget === "object") {
    config.budget = parsed.budget as Partial<Budget>;
  }
  if (parsed.commandAllowlist !== undefined) {
    if (!Array.isArray(parsed.commandAllowlist) || parsed.commandAllowlist.some((entry) => !Array.isArray(entry) || entry.some((part) => typeof part !== "string"))) {
      throw new KaryaError("commandAllowlist must be an array of string arrays.", "bad_config");
    }
    config.commandAllowlist = parsed.commandAllowlist as string[][];
  }
  return config;
}
