import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ArtifactList } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/characters")({
  head: () => pageHead("Characters", "Character designs created for your videos."),
  component: Page,
});

function Page() {
  return <ArtifactList table="characters" title="Characters" description="Character design sheets created by the Character design step." icon={Users} emptyText="Run the Character design step on a project to create characters." />;
}
