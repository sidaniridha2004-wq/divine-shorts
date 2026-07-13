import { createFileRoute } from "@tanstack/react-router";
import { WizardShell } from "@/components/wizard/WizardShell";
import { ProjectStateProvider, type ProjectSettings } from "@/lib/project-state";
import { getProject } from "@/lib/projects-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  p: z.string().optional(),
  id: z.string().optional(),
  // Verse pre-selection via URL params (survives refreshes, unlike router state)
  surah: z.coerce.number().int().min(1).max(114).optional(),
  from: z.coerce.number().int().min(1).optional(),
  to: z.coerce.number().int().min(1).optional(),
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
  const { p, id, surah, from, to } = Route.useSearch();
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
    } else if (surah) {
      // Pre-fill from URL (Verse of the Day, search results, shared links)
      const fromAyah = from ?? 1;
      const toAyah = Math.max(fromAyah, to ?? fromAyah);
      setInitial({ chapterId: surah, fromAyah, toAyah });
      toast.success(
        `Verse pre-loaded: ${surah}:${fromAyah}${toAyah !== fromAyah ? `-${toAyah}` : ""}`,
      );
    } else {
      // Legacy marker set by older versions of the daily page
      try {
        const raw = localStorage.getItem("quranreels:daily-preselect");
        if (raw) {
          localStorage.removeItem("quranreels:daily-preselect");
          const m = JSON.parse(raw) as { chapterId?: number; ayah?: number };
          if (m?.chapterId && m?.ayah) {
            setInitial({ chapterId: m.chapterId, fromAyah: m.ayah, toAyah: m.ayah });
            toast.success(`Verse pre-loaded: ${m.chapterId}:${m.ayah}`);
          }
        }
      } catch {}
    }
    setReady(true);
  }, [p, id, surah, from, to]);

  if (!ready) return null;
  return (
    <ProjectStateProvider initial={initial ?? undefined}>
      <WizardShell />
    </ProjectStateProvider>
  );
}
