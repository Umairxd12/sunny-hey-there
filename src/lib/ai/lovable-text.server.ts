import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { TextGenerationProvider } from "./types";

const MODEL = "openai/gpt-6-astra";

/** Built-in fallback text provider (Lovable AI). Used only when no external text provider is configured. */
export function createLovableTextProvider(): TextGenerationProvider {
  return {
    id: "lovable-ai",
    name: "Lovable AI (built-in fallback)",
    isConfigured: () => !!process.env["LOVABLE_API_KEY"],
    async generate({ system, prompt }) {
      const apiKey = process.env["LOVABLE_API_KEY"]!;
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
          openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
        },
      });
      const text = await result.text;
      if (failure || !text.trim()) {
        const status = (failure as { statusCode?: number })?.statusCode ?? 500;
        throw new Error(
          status === 402 ? "AI credits are used up. Add credits in workspace settings, or connect your own text provider."
          : status === 429 ? "Too many AI requests right now. Please wait a moment and try again."
          : status === 403 ? "AI access is blocked for this workspace."
          : "The AI did not return a result. Please try again.",
        );
      }
      return { text, model: MODEL };
    },
  };
}
