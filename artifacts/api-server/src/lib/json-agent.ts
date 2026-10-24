export interface AgentMessage {
  content: ReadonlyArray<{ type: string; text?: string }>;
}

export interface AgentAttempt {
  attempt: number;
  status: "success" | "invalid_response" | "error";
  response?: unknown;
  responseText?: string;
}

export class InvalidAgentResponse extends Error {
  readonly status = 502;
  constructor() {
    super("The AI returned invalid JSON or an invalid result twice. Please try again.");
    this.name = "InvalidAgentResponse";
  }
}

/**
 * One initial attempt plus exactly one retry for malformed JSON or invalid shape.
 * Audit each model invocation separately, even when a later database write fails.
 * Auditing failures are deliberately outside the response-validation catch:
 * a database error must not trigger an extra, unlogged model call.
 */
export async function requestAgentJson<T>(options: {
  call: (attempt: number) => Promise<AgentMessage>;
  validate: (output: unknown) => T;
  audit: (event: AgentAttempt) => Promise<void>;
}): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let message: AgentMessage;
    try {
      message = await options.call(attempt);
    } catch (error) {
      await options.audit({ attempt, status: "error" });
      throw error;
    }
    const text = message.content.filter((block) => block.type === "text")
      .map((block) => block.text ?? "").join("").trim();
    let response: unknown;
    let result: T;
    try {
      // Never evaluate model output or extract a JSON fragment from prose.
      // Fenced JSON is also invalid: the prompts require JSON only.
      response = JSON.parse(text);
      result = options.validate(response);
    } catch {
      await options.audit({ attempt, status: "invalid_response", responseText: text.slice(0, 16000) });
      if (attempt === 2) throw new InvalidAgentResponse();
      continue;
    }
    await options.audit({ attempt, status: "success", response });
    return result;
  }
  throw new InvalidAgentResponse();
}
