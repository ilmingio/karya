import { describe, expect, it } from "vitest";
import { OpenAICompatibleProvider } from "./openai";

describe("OpenAICompatibleProvider", () => {
  it("parses tool calls and retries a server error once", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-testsecretvalue");
      if (calls === 1) return new Response("busy", { status: 500 });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "see sk-testsecretvalue",
                tool_calls: [
                  { id: "call_1", function: { name: "read_file", arguments: "{\"path\":\"src/app.ts\"}" } },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const provider = new OpenAICompatibleProvider({
      apiKey: "sk-testsecretvalue",
      baseUrl: "https://example.test/v1",
      model: "test-model",
      fetchImpl,
    });
    const response = await provider.complete(
      [{ role: "user", content: "hi" }],
      [],
    );
    expect(calls).toBe(2);
    expect(response.content).not.toContain("sk-testsecretvalue");
    expect(response.toolCalls[0]).toMatchObject({ name: "read_file", arguments: { path: "src/app.ts" } });
  });
});
