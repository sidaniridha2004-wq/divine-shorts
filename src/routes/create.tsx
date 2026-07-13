import { createFileRoute } from "@tanstack/react-router";
import { WizardShell } from "@/components/wizard/WizardShell";
import { ProjectStateProvider, type ProjectSettings } from "@/lib/project-state";
import { getProject } from "@/lib/projects-store";
import { useEffect, useState } from "react";
import { z } from "zod";

const searchSchema = z.object({
  p: z.string().optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/create")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Create — QuranReels Pro" },
      { name: "description", content: "Design and export a Quran verse video." },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const { p, id } = Route.useSearch();
  const [initial, setInitial] = useState<Partial<ProjectSettings> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (p) {
      try {
        const parsed = JSON.parse(decodeURIComponent(atob(p))) as ProjectSettings;
        setInitial(parsed);
      } catch {}
    } else if (id) {
      const saved = getProject(id);
      if (saved) setInitial(saved.settings);
    }
    setReady(true);
  }, [p, id]);

  if (!ready) return null;
  return (
    <ProjectStateProvider initial={initial ?? undefined}>
      <WizardShell />
    </ProjectStateProvider>
  );
}
