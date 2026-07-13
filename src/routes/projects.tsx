import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listProjects, deleteProject, duplicateProject, type SavedProject } from "@/lib/projects-store";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "My Projects — QuranReels Pro" },
      { name: "description", content: "Your saved Quran video drafts." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [projects, setProjects] = useState<SavedProject[]>([]);

  useEffect(() => {
    setProjects(listProjects());
  }, []);

  const refresh = () => setProjects(listProjects());

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-bold text-gold">
            QuranReels
          </Link>
          <Link
            to="/create"
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> New project
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 font-display text-3xl font-bold">My projects</h1>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="mb-4 text-muted-foreground">
              No saved projects yet. Create your first video.
            </p>
            <Link to="/create">
              <Button>Create video</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="relative aspect-[9/16] emerald-gradient">
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                    <div dir="rtl" className="font-arabic text-2xl text-white">
                      {p.settings.chapterName}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs text-white">
                    {p.settings.chapterId}:{p.settings.fromAyah}
                    {p.settings.toAyah !== p.settings.fromAyah && `-${p.settings.toAyah}`}
                  </div>
                </div>
                <div className="p-3">
                  <div className="mb-1 truncate font-medium">{p.settings.title}</div>
                  <div className="mb-3 text-xs text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/create"
                      search={{ id: p.id }}
                      className="flex-1 rounded-md bg-accent px-3 py-1.5 text-center text-xs font-medium text-accent-foreground"
                    >
                      Open
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        duplicateProject(p.id);
                        refresh();
                        toast.success("Duplicated");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        deleteProject(p.id);
                        refresh();
                        toast.success("Deleted");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
