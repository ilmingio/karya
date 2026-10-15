export const DEFAULT_BUDGET = {
  maxModelCalls: 12,
  maxToolCalls: 24,
  timeoutMs: 120_000,
  maxFileBytes: 100_000,
} as const;

export interface Budget {
  maxModelCalls: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxFileBytes: number;
}

export type Risk = "low" | "high";

export interface PlannedCheck {
  name: string;
  argv: string[];
}

export interface Plan {
  summary: string;
  steps: string[];
  risk: Risk;
  checks: PlannedCheck[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ModelResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface ModelProvider {
  complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<ModelResponse>;
}

export interface ApprovalRequest {
  id: string;
  kind: "plan" | "patch" | "command";
  summary: string;
  detail: string;
}

export type CheckStatus = "verified" | "failed" | "unverified";

export interface VerificationCheck {
  name: string;
  argv: string[];
  status: CheckStatus;
  exitCode?: number;
  outputExcerpt?: string;
}

export interface VerificationReport {
  checks: VerificationCheck[];
  summary: string;
}

export interface SessionEvent {
  ts: string;
  type: string;
  data: Record<string, unknown>;
}

export interface KaryaConfig {
  workspaceRoot: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  budget: Budget;
  commandAllowlist: string[][];
}

export type AgentStatus = "completed" | "stopped" | "rejected";

export interface ExecutedCommand {
  argv: string[];
  exitCode: number | null;
  excerpt: string;
}

export class KaryaError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "KaryaError";
    this.code = code;
  }
}

const SECRET_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{8,}|ghp_[A-Za-z0-9]{8,})\b/g;

export function redact(text: string, secrets: readonly string[]): string {
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 8))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const secret of unique) {
    out = out.split(secret).join("[REDACTED]");
  }
  return out.replace(SECRET_PATTERN, "[REDACTED]");
}

export function redactUnknown(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, secrets));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactUnknown(item, secrets);
    }
    return out;
  }
  return value;
}
