// Project persistence in localStorage. Structured for later Supabase migration.
import type { ProjectSettings } from "./project-state";

const KEY = "quranreels:projects";

export type SavedProject = {
  id: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  thumbnail?: string;
};

export function listProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedProject[];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveProject(p: SavedProject) {
  const all = listProjects().filter((x) => x.id !== p.id);
  all.unshift(p);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteProject(id: string) {
  const all = listProjects().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function duplicateProject(id: string): SavedProject | null {
  const all = listProjects();
  const src = all.find((x) => x.id === id);
  if (!src) return null;
  const copy: SavedProject = {
    ...src,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ...src.settings,
      title: (src.settings.title || "Untitled") + " (copy)",
    },
  };
  saveProject(copy);
  return copy;
}

export function getProject(id: string): SavedProject | null {
  return listProjects().find((p) => p.id === id) ?? null;
}
