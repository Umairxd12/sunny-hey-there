import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const MODEL = "openai/gpt-6-astra";

export class AiGatewayError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Runs one text generation through Lovable AI. Streams internally, returns final text. */
export async function generateStepText(system: string, prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiGatewayError("AI is not configured", 401);
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  let failure: unknown;
  const result = streamText({
    model: provider.responses(MODEL),
    system,
    prompt,
    onError: ({ error }) => { failure = error; },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  if (failure || !text.trim()) {
    const status = (failure as { statusCode?: number })?.statusCode ?? 500;
    const msg =
      status === 402 ? "AI credits are used up. Add credits in workspace settings."
      : status === 429 ? "Too many AI requests right now. Please wait a moment and try again."
      : status === 403 ? "AI access is blocked for this workspace."
      : "The AI did not return a result. Please try again.";
    throw new AiGatewayError(msg, status);
  }
  return { text, model: MODEL };
}
