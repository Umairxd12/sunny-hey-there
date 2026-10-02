import { createFileRoute } from "@tanstack/react-router";
import { PanelsTopLeft } from "lucide-react";
import { ArtifactList } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/storyboards")({
  head: () => pageHead("Storyboards", "Per-second storyboards for your videos."),
  component: Page,
});

function Page() {
  return <ArtifactList table="storyboards" title="Storyboards" description="Second-by-second storyboards created for each project." icon={PanelsTopLeft} emptyText="Run the Storyboard step on a project to create one." />;
}
