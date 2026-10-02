import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, BookOpenText, CalendarDays, Clapperboard, Cpu, FolderKanban, Film, LayoutDashboard, LogOut, Menu, Settings, Share2, Sparkles, Timer, Users, PanelsTopLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "Create Video", icon: Sparkles },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/characters", label: "Characters", icon: Users },
  { to: "/storyboards", label: "Storyboards", icon: PanelsTopLeft },
  { to: "/videos", label: "Videos", icon: Film },
  { to: "/social", label: "Social Accounts", icon: Share2 },
  { to: "/scheduler", label: "Scheduler", icon: Timer },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/skills", label: "Skill Manager", icon: BookOpenText },
  { to: "/providers", label: "AI Providers", icon: Cpu },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = path === to || path.startsWith(to + "/");
        return (
          <Link key={to} to={to} onClick={onNavigate}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
            <Icon className={cn("size-4", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-3 py-4">
      <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div>
      <span className="font-display text-base font-semibold">Toonflow Studio</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto"><NavList /></div>
        <button onClick={signOut} className="mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60"><LogOut className="size-4" />Sign out</button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-2 lg:hidden">
          <Brand />
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open menu"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-3"><Brand /><NavList /></SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 animate-in fade-in duration-300">{children}</main>
      </div>
    </div>
  );
}
