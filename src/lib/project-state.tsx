import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AspectRatio = "9:16" | "1:1" | "16:9" | "4:5";

export type ProjectSettings = {
  title: string;
  // Verse
  chapterId: number;
  chapterName: string;
  fromAyah: number;
  toAyah: number;
  // Reciter
  reciterId: number;
  audioSpeed: 0.75 | 1;
  fadeIn: boolean;
  fadeOut: boolean;
  ambientId: string | null;
  ambientVolume: number; // 0..1
  // Text
  arabicFont: string;
  arabicSize: number;
  translationId: number | null;
  showTransliteration: boolean;
  textColor: string;
  letterSpacing: number;
  lineHeight: number;
  textShadow: boolean;
  maxWidthPct: number;
  layout: "centered" | "arabic-only" | "bottom-third" | "split";
  animation: "fade" | "word-fade" | "typewriter" | "slide-up" | "scale-glow";
  animationSpeed: number;
  // Style
  themeId: string;
  customBg: string | null;
  overlayDarkness: number; // 0..0.8
  blur: number; // 0..20
  vignette: boolean;
  grain: boolean;
  kenBurns: boolean;
  watermark: { type: "none" | "logo" | "text"; text: string; position: "tl" | "tr" | "bl" | "br" };
  frame: "none" | "gold-thin" | "arch" | "rounded";
  // Format
  aspect: AspectRatio;
  resolution: 720 | 1080;
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  title: "Untitled",
  chapterId: 36,
  chapterName: "Ya-Sin",
  fromAyah: 1,
  toAyah: 3,
  reciterId: 123,
  audioSpeed: 1,
  fadeIn: true,
  fadeOut: true,
  ambientId: null,
  ambientVolume: 0.15,
  arabicFont: "kfgqpc",
  arabicSize: 56,
  translationId: 20,
  showTransliteration: false,
  textColor: "#F5F1E8",
  letterSpacing: 0,
  lineHeight: 1.9,
  textShadow: true,
  maxWidthPct: 85,
  layout: "centered",
  animation: "fade",
  animationSpeed: 1,
  themeId: "stars",
  customBg: null,
  overlayDarkness: 0.4,
  blur: 0,
  vignette: true,
  grain: false,
  kenBurns: true,
  watermark: { type: "text", text: "@quranreels", position: "br" },
  frame: "none",
  aspect: "9:16",
  resolution: 1080,
};

type Ctx = {
  settings: ProjectSettings;
  update: (patch: Partial<ProjectSettings>) => void;
  reset: () => void;
  setAll: (s: ProjectSettings) => void;
};

const ProjectStateCtx = createContext<Ctx | null>(null);

export function ProjectStateProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<ProjectSettings>;
}) {
  const [settings, setSettings] = useState<ProjectSettings>({
    ...DEFAULT_SETTINGS,
    ...initial,
  });
  const update = useCallback(
    (patch: Partial<ProjectSettings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const setAll = useCallback((s: ProjectSettings) => setSettings(s), []);
  return (
    <ProjectStateCtx.Provider value={{ settings, update, reset, setAll }}>
      {children}
    </ProjectStateCtx.Provider>
  );
}

export function useProjectState() {
  const ctx = useContext(ProjectStateCtx);
  if (!ctx) throw new Error("useProjectState must be used inside ProjectStateProvider");
  return ctx;
}
