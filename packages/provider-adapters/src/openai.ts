import { KaryaError, redact, type ChatMessage, type ModelResponse, type ToolCall, type ToolDefinition } from "@karya/shared-types";
import type { ModelProvider } from "@karya/shared-types";

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const body = {
      model: this.options.model,
      messages: messages.map(toOpenAI),
      tools: tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    };

    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timeout = AbortSignal.timeout(60_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: combined,
      });
      if (response.ok) return parseResponse(await response.json(), this.options.apiKey);
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) break;
    }
    throw new KaryaError(`Model provider returned ${lastStatus}.`, "provider_error");
  }
}

function toOpenAI(message: ChatMessage): OpenAIMessage {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant") {
    const mapped: OpenAIMessage = {
      role: "assistant",
      content: message.content || null,
    };
    if (message.toolCalls.length > 0) {
      mapped.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      }));
    }
    return mapped;
  }
  return { role: message.role, content: message.content };
}

function parseResponse(payload: unknown, apiKey: string): ModelResponse {
  const choice = (payload as { choices?: Array<{ message?: Record<string, unknown> }> }).choices?.[0]?.message;
  if (!choice) {
    throw new KaryaError("Model provider returned no message.", "provider_error");
  }
  const content = redact(typeof choice.content === "string" ? choice.content : "", [apiKey]);
  const rawCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
  const toolCalls: ToolCall[] = rawCalls.map((call, index) => {
    const record = call as { id?: string; function?: { name?: string; arguments?: string } };
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(record.function?.arguments || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
    return {
      id: record.id || `call_${index + 1}`,
      name: record.function?.name || "",
      arguments: args,
    };
  });
  return { content, toolCalls };
}
