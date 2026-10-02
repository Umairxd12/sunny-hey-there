import type { TextGenerationProvider } from "./types";

/**
 * Any OpenAI-compatible chat API (OpenAI, Groq, Together, OpenRouter, DeepSeek…).
 * Configure with server secrets: AI_TEXT_BASE_URL, AI_TEXT_API_KEY, AI_TEXT_MODEL.
 */
export function createOpenAICompatibleTextProvider(): TextGenerationProvider {
  const baseUrl = process.env["AI_TEXT_BASE_URL"];
  const apiKey = process.env["AI_TEXT_API_KEY"];
  const model = process.env["AI_TEXT_MODEL"];
  return {
    id: "openai-compatible",
    name: "External text provider",
    isConfigured: () => !!(baseUrl && apiKey && model),
    async generate({ system, prompt }) {
      const res = await fetch(`${baseUrl!.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
      });
      if (!res.ok) {
        console.error("external text provider error", res.status, await res.text().catch(() => ""));
        throw new Error(res.status === 401 ? "The external text provider rejected the API key." : res.status === 429 ? "The external text provider is rate limiting. Try again shortly." : "The external text provider failed. Try again.");
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("The external text provider returned an empty result.");
      return { text, model: model! };
    },
  };
}
