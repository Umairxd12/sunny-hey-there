import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runPipelineStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), stepKey: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { runStage } = await import("./ai/orchestrator.server");
    return runStage(context.supabase, context.userId, data.projectId, data.stepKey);
  });

export const suggestVideoIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    topic: z.string().max(200).optional(),
    platform: z.string().max(40).optional(),
    audience: z.string().max(200).optional(),
    duration: z.number().int().min(3).max(180),
    language: z.string().max(40),
  }).parse(d))
  .handler(async ({ data }) => {
    const { suggestIdeas } = await import("./ai/orchestrator.server");
    try {
      return { ok: true as const, ideas: await suggestIdeas(data) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not suggest ideas." };
    }
  });

export const getEngineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listProviderStatus } = await import("./ai/registry.server");
    const { loadActiveSkill } = await import("./ai/orchestrator.server");
    const skill = await loadActiveSkill();
    return {
      providers: listProviderStatus(),
      activeSkill: skill ? { name: skill.name, version: skill.version } : null,
    };
  });
