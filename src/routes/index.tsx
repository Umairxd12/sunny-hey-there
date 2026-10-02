import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Toonflow Studio — AI 3D Cartoon Video Automation" },
      { name: "description", content: "Turn ideas into 3D cartoon videos and publish them to Facebook, YouTube and TikTok." },
      { property: "og:title", content: "Toonflow Studio — AI 3D Cartoon Video Automation" },
      { property: "og:description", content: "Turn ideas into 3D cartoon videos and publish them to Facebook, YouTube and TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
