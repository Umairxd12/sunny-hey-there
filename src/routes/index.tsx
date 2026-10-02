import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, CalendarDays, Clapperboard, Film, PanelsTopLeft, Share2, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Toonflow Studio — AI 3D Cartoon Video Automation" },
      { name: "description", content: "Turn one idea into a finished 3D cartoon video and publish it to Facebook, YouTube and TikTok." },
      { property: "og:title", content: "Toonflow Studio — AI 3D Cartoon Video Automation" },
      { property: "og:description", content: "Turn one idea into a finished 3D cartoon video and publish it to Facebook, YouTube and TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const FLOW = [
  { icon: Sparkles, title: "Idea", text: "Write one sentence about your video." },
  { icon: BookOpenText, title: "Skill-driven brief", text: "Your SKILL.md shapes every decision." },
  { icon: Users, title: "Characters & world", text: "Consistent cast, setting and 3D style." },
  { icon: PanelsTopLeft, title: "Per-second storyboard", text: "Every second planned before rendering." },
  { icon: Film, title: "Generate & review", text: "Video checked against the storyboard." },
  { icon: Share2, title: "Publish", text: "Facebook, YouTube and TikTok, on schedule." },
];

function Home() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, []);
  const cta = signedIn ? { to: "/dashboard" as const, label: "Open studio" } : { to: "/auth" as const, label: "Get started" };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div>
          <span className="font-display text-base font-semibold">Toonflow Studio</span>
        </div>
        <Button variant={signedIn ? "default" : "outline"} asChild><Link to={cta.to}>{signedIn ? "Open studio" : "Sign in"}</Link></Button>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-20">
        <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"><Sparkles className="size-3" />AI 3D cartoon production</span>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.05] md:text-6xl">From one idea to a finished cartoon — <span className="text-primary">published everywhere.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">Toonflow runs the whole production line for you: brief, characters, world, storyboard, video, review, captions and posting.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild><Link to={cta.to}>{cta.label}<ArrowRight className="size-4" /></Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((f, i) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><f.icon className="size-5" /></div>
                <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-3"><CalendarDays className="size-5 text-primary" /><p className="text-sm">Plan, schedule and track results from one calm dashboard.</p></div>
          <Button variant="outline" asChild><Link to={cta.to}>{cta.label}</Link></Button>
        </div>
      </section>
    </div>
  );
}
