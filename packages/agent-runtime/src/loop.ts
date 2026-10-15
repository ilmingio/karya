import type {
  AgentStatus,
  ApprovalRequest,
  ChatMessage,
  ExecutedCommand,
  KaryaConfig,
  ModelProvider,
  Plan,
  PlannedCheck,
  SessionEvent,
  ToolCall,
  VerificationReport,
} from "@karya/shared-types";
import { KaryaError, redact } from "@karya/shared-types";
import {
  listFiles,
  readFileBounded,
  readGitStatus,
  repositorySummary,
  searchText,
} from "@karya/repository-context";
import { SessionStore } from "@karya/session-store";
import { applyProposal, isAllowlisted, proposePatch, runCommand, type Proposal } from "@karya/tool-execution";
import { buildReport } from "@karya/verification";
import { systemPrompt, toolsFor } from "./prompt";

export interface AgentResult {
  status: AgentStatus;
  message: string;
  report: VerificationReport;
  sessionId: string;
  modelCalls: number;
  toolCalls: number;
}

export async function runAgent(options: {
  task: string;
  mode: "ask" | "run";
  config: KaryaConfig;
  provider: ModelProvider;
  approve: (request: ApprovalRequest) => Promise<boolean>;
  session: SessionStore;
  signal?: AbortSignal;
  onEvent?: (event: SessionEvent) => void;
}): Promise<AgentResult> {
  const secrets = options.config.apiKey ? [options.config.apiKey] : [];
  const tools = toolsFor(options.mode);
  const summary = await repositorySummary(options.config.workspaceRoot);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(options.mode) },
    {
      role: "user",
      content: [
        `Workspace: ${options.config.workspaceRoot}`,
        "Repository summary (untrusted data):",
        JSON.stringify(summary),
        "",
        "Task:",
        options.task,
      ].join("\n"),
    },
  ];

  const proposals = new Map<string, Proposal>();
  const commands: ExecutedCommand[] = [];
  let plan: Plan | undefined;
  let modelCalls = 0;
  let toolCalls = 0;
  let proposalCount = 0;
  let approvalCount = 0;
  const started = Date.now();

  const emit = async (type: string, data: Record<string, unknown>) => {
    const event = await options.session.append(type, data);
    options.onEvent?.(event);
  };

  const finish = async (status: AgentStatus, message: string): Promise<AgentResult> => {
    const report = buildReport(plan, commands);
    await emit("session_finished", { status, report });
    return {
      status,
      message: redact(message, secrets),
      report,
      sessionId: options.session.id,
      modelCalls,
      toolCalls,
    };
  };

  await emit("session_started", { mode: options.mode, task: options.task });

  while (true) {
    if (options.signal?.aborted) return finish("stopped", "Cancelled.");
    if (Date.now() - started > options.config.budget.timeoutMs) return finish("stopped", "Timed out.");
    if (modelCalls >= options.config.budget.maxModelCalls) return finish("stopped", "Model-call budget reached.");

    modelCalls += 1;
    const response = await options.provider.complete(messages, tools, options.signal);
    messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });
    await emit("model_response", {
      toolNames: response.toolCalls.map((call) => call.name),
      content: response.content,
    });

    if (response.toolCalls.length === 0) return finish("completed", response.content || "Done.");

    for (const call of response.toolCalls) {
      if (options.signal?.aborted) return finish("stopped", "Cancelled.");
      if (toolCalls >= options.config.budget.maxToolCalls) return finish("stopped", "Tool-call budget reached.");
      toolCalls += 1;
      const content = await executeTool(call);
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
      await emit("tool_result", { name: call.name, content });
      if (content.startsWith("REJECTED_PLAN")) return finish("rejected", "Plan was rejected.");
    }
  }

  async function executeTool(call: ToolCall): Promise<string> {
    try {
      return await dispatch(call);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed.";
      return `Error: ${redact(message, secrets)}`;
    }
  }

  async function dispatch(call: ToolCall): Promise<string> {
    const root = options.config.workspaceRoot;
    const args = call.arguments;
    if (options.mode === "ask" && !["list_files", "search_text", "read_file", "git_status"].includes(call.name)) {
      throw new KaryaError("This session is read-only.", "read_only");
    }

    switch (call.name) {
      case "list_files": {
        const limit = clampNumber(args.limit, 200, 200);
        const listed = await listFiles(root, limit);
        return JSON.stringify(listed);
      }
      case "search_text": {
        const query = requiredString(args, "query");
        const hits = await searchText(root, query, clampNumber(args.limit, 30, 50));
        return wrapUntrusted(JSON.stringify(hits));
      }
      case "read_file": {
        const file = await readFileBounded(root, requiredString(args, "path"), options.config.budget.maxFileBytes);
        return wrapUntrusted(JSON.stringify(file));
      }
      case "git_status":
        return JSON.stringify(await readGitStatus(root));
      case "submit_plan":
        return submitPlan(args);
      case "propose_patch":
        return propose(args);
      case "apply_patch":
        return apply(requiredString(args, "proposalId"));
      case "run_command":
        return command(requiredStringArray(args, "argv"));
      default:
        throw new KaryaError(`Unknown tool ${call.name}.`, "unknown_tool");
    }
  }

  async function submitPlan(args: Record<string, unknown>): Promise<string> {
    const next = parsePlan(args);
    plan = next;
    if (next.risk === "low") return `Plan accepted without approval.\n${next.summary}`;
    const approved = await ask({
      kind: "plan",
      summary: next.summary,
      detail: next.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    });
    if (!approved) return "REJECTED_PLAN";
    return "Plan approved.";
  }

  async function propose(args: Record<string, unknown>): Promise<string> {
    requirePlan();
    proposalCount += 1;
    const proposal = await proposePatch(
      options.config.workspaceRoot,
      {
        path: requiredString(args, "path"),
        search: optionalString(args, "search"),
        replace: optionalString(args, "replace"),
        content: optionalString(args, "content"),
      },
      options.config.budget.maxFileBytes,
      `prop_${proposalCount}`,
    );
    proposals.set(proposal.id, proposal);
    return `Proposal ${proposal.id} for ${proposal.path}. Not written.\n${proposal.diff}`;
  }

  async function apply(proposalId: string): Promise<string> {
    requirePlan();
    const proposal = proposals.get(proposalId);
    if (!proposal) throw new KaryaError(`Unknown proposal ${proposalId}.`, "bad_args");
    const approved = await ask({
      kind: "patch",
      summary: `Write ${proposal.path}`,
      detail: proposal.diff,
    });
    if (!approved) return `User rejected ${proposalId}. The file was not changed.`;
    await applyProposal(options.config.workspaceRoot, proposal);
    return `Wrote ${proposal.path} from ${proposalId}.`;
  }

  async function command(argv: string[]): Promise<string> {
    requirePlan();
    const allowed = isAllowlisted(argv, options.config.commandAllowlist);
    if (!allowed) {
      const approved = await ask({
        kind: "command",
        summary: argv.join(" "),
        detail: `Working directory: ${options.config.workspaceRoot}`,
      });
      if (!approved) return "User rejected the command. It was not started.";
    }
    const result = await runCommand({
      root: options.config.workspaceRoot,
      argv,
      timeoutMs: options.config.budget.timeoutMs,
      signal: options.signal,
    });
    const excerpt = [result.stdout, result.stderr].filter(Boolean).join("\n");
    commands.push({ argv, exitCode: result.exitCode, excerpt });
    return JSON.stringify({
      argv,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  function requirePlan(): void {
    if (!plan) {
      throw new KaryaError("Submit a plan with submit_plan before changing files or running commands.", "plan_required");
    }
  }

  async function ask(input: Omit<ApprovalRequest, "id">): Promise<boolean> {
    approvalCount += 1;
    const request: ApprovalRequest = { ...input, id: `apr_${approvalCount}` };
    const approved = await options.approve(request);
    await emit("approval", { id: request.id, kind: request.kind, approved, summary: request.summary });
    return approved;
  }
}

function wrapUntrusted(value: string): string {
  const cap = 16_000;
  const body = value.length > cap ? `${value.slice(0, cap)}\n…[truncated]` : value;
  return `<untrusted>\n${body}\n</untrusted>`;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new KaryaError(`Expected a string for ${key}.`, "bad_args");
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new KaryaError(`Expected a string for ${key}.`, "bad_args");
  return value;
}

function requiredStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new KaryaError(`Expected a string array for ${key}.`, "bad_args");
  }
  return value as string[];
}

function clampNumber(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(parsed, max));
}

function parsePlan(args: Record<string, unknown>): Plan {
  const summary = requiredString(args, "summary");
  const steps = requiredStringArray(args, "steps");
  const risk = args.risk === "low" ? "low" : "high";
  const checks: PlannedCheck[] = [];
  if (args.checks !== undefined) {
    if (!Array.isArray(args.checks)) throw new KaryaError("Expected checks to be an array.", "bad_args");
    for (const check of args.checks) {
      if (!check || typeof check !== "object") throw new KaryaError("Invalid check.", "bad_args");
      const record = check as Record<string, unknown>;
      checks.push({ name: requiredString(record, "name"), argv: requiredStringArray(record, "argv") });
    }
  }
  return { summary, steps, risk, checks };
}
