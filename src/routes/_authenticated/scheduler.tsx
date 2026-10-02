import { createFileRoute } from "@tanstack/react-router";
import { Timer } from "lucide-react";
import { NotConnectedPage } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/scheduler")({
  head: () => pageHead("Scheduler", "Schedule posts to your social accounts."),
  component: Page,
});

function Page() {
  return <NotConnectedPage title="Scheduler" description="Pick a time and the studio publishes your video automatically." icon={Timer} body="Connect Facebook, YouTube or TikTok to start scheduling posts." cta={{ to: "/social", label: "Connect accounts" }} />;
}
