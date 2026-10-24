import Anthropic from "@anthropic-ai/sdk";

// Managed Replit credentials remain exclusively on the server.
export function aiClient() {
  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || !process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("AI is not configured. Enable the Replit Anthropic integration."), { status: 503 });
  }
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    maxRetries: 3,
    timeout: 120_000,
  });
}

export function parseAIJson(message: Anthropic.Message): unknown {
  const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw Object.assign(new Error("The director returned an invalid response. Please try again."), { status: 502 });
  }
}
