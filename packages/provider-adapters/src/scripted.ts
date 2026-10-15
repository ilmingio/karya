import type { ChatMessage, ModelProvider, ModelResponse } from "@karya/shared-types";

export type { ModelProvider };

export class ScriptedProvider implements ModelProvider {
  constructor(
    private readonly respond: (messages: ChatMessage[]) => ModelResponse | Promise<ModelResponse>,
  ) {}

  complete(messages: ChatMessage[]): Promise<ModelResponse> {
    return Promise.resolve(this.respond(messages));
  }
}
