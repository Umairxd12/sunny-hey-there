import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/studio/ui";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Settings", "Your account and studio settings."),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
      return { email: u.user?.email, isAdmin: !!isAdmin };
    },
  });
  return (
    <>
      <PageHeader title="Settings" description="Your account details." />
      <div className="max-w-xl space-y-3 rounded-2xl border bg-card p-6 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{data?.email}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{data?.isAdmin ? "Administrator" : "Member"}</span></div>
      </div>
    </>
  );
}
