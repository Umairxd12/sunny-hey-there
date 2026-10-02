import { createFileRoute } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { NotConnectedPage } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => pageHead("Videos", "Generated cartoon videos."),
  component: Page,
});

function Page() {
  return <NotConnectedPage title="Videos" description="Finished and in-progress videos from your video AI provider." icon={Film} body="Videos appear here once a video AI provider is connected. Your final video prompts are already ready in each project." cta={{ to: "/providers", label: "View AI providers" }} />;
}
