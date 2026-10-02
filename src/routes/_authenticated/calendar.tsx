import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { NotConnectedPage } from "@/components/studio/ListPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => pageHead("Content Calendar", "Plan your posting calendar."),
  component: Page,
});

function Page() {
  return <NotConnectedPage title="Content calendar" description="A month view of everything planned and published." icon={CalendarDays} body="Scheduled posts will fill this calendar once social accounts are connected." cta={{ to: "/social", label: "Connect accounts" }} />;
}
