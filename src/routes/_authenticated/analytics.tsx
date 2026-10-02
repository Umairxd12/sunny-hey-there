import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { NotConnectedPage } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => pageHead("Analytics", "Views, likes, comments and shares across platforms."),
  component: Page,
});

function Page() {
  return <NotConnectedPage title="Analytics" description="Views, likes, comments and shares collected from every platform." icon={BarChart3} body="Results show here after your first video is published to a connected account." cta={{ to: "/social", label: "Connect accounts" }} />;
}
