import { useMemo, useState, type CSSProperties } from "react";
import { useProjectState } from "@/lib/project-state";
import { THEMES, THEME_CATEGORIES, type GeneratedTheme } from "@/lib/themes";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function generatedStyle(g: GeneratedTheme): CSSProperties {
  switch (g.type) {
    case "solid":
      return { background: g.color };
    case "gradient":
      return { background: `linear-gradient(135deg, ${g.from}, ${g.to})` };
    case "particles":
      return {
        background: `radial-gradient(circle at 25% 30%, ${g.color}33 0%, transparent 30%), radial-gradient(circle at 70% 60%, ${g.color}2e 0%, transparent 25%), ${g.bg}`,
      };
    case "bokeh":
      return {
        background: `radial-gradient(circle at 30% 40%, ${g.color}44 0%, transparent 35%), radial-gradient(circle at 75% 65%, ${g.color}33 0%, transparent 30%), ${g.bg}`,
      };
    case "pattern":
      return {
        background: `repeating-linear-gradient(45deg, ${g.fg}22 0 1px, transparent 1px 24px), repeating-linear-gradient(-45deg, ${g.fg}22 0 1px, transparent 1px 24px), ${g.bg}`,
      };
  }
}

export function Step4Style() {
  const { settings, update } = useProjectState();
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const shown = useMemo(() => {
    let list = THEMES;
    if (category !== "all") list = list.filter((t) => t.category === category);
    const query = q.trim().toLowerCase();
    if (query) list = list.filter((t) => t.name.toLowerCase().includes(query));
    return list;
  }, [category, q]);

  const randomTheme = () => {
    const t = THEMES[Math.floor(Math.random() * THEMES.length)];
    update({ themeId: t.id, customBg: null });
    toast.success(`Background: ${t.name}`);
  };

  const handleUpload = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }
    if (!/(image|video)\//i.test(file.type)) {
      toast.error("Please upload an image or video");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ customBg: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Label>Theme ({THEMES.length} backgrounds)</Label>
          <Button variant="ghost" size="sm" onClick={randomTheme}>
            <Shuffle className="mr-1 h-4 w-4" /> Random
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {[{ id: "all", name: "All" }, ...THEME_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                category === c.id
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-card text-muted-foreground hover:border-accent/50"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search backgrounds…"
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((t) => {
            const active = settings.themeId === t.id && !settings.customBg;
            const hovering = hoverId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ themeId: t.id, customBg: null })}
                onMouseEnter={() => setHoverId(t.id)}
                onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                  active
                    ? "border-accent shadow-gold"
                    : "border-border hover:border-accent/50"
                }`}
              >
                {t.generated && (
                  <div className="absolute inset-0" style={generatedStyle(t.generated)} />
                )}
                {t.poster && !(hovering && t.video) && (
                  <img
                    src={t.poster}
                    alt={t.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                {t.video && hovering && (
                  <video
                    src={t.video}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-xs font-medium text-white">
                  {t.name}
                </div>
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              No backgrounds match "{q}"
            </p>
          )}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Upload custom background</Label>
        <Input
          type="file"
          accept="image/*,video/mp4,video/webm"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        {settings.customBg && (
          <button
            type="button"
            className="mt-2 text-xs text-accent underline"
            onClick={() => update({ customBg: null })}
          >
            Remove custom background
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-2 block">
            Overlay darkness: {Math.round(settings.overlayDarkness * 100)}%
          </Label>
          <Slider
            value={[settings.overlayDarkness * 100]}
            min={0}
            max={80}
            step={5}
            onValueChange={(v) => update({ overlayDarkness: v[0] / 100 })}
          />
        </div>
        <div>
          <Label className="mb-2 block">Blur: {settings.blur}px</Label>
          <Slider
            value={[settings.blur]}
            min={0}
            max={20}
            step={1}
            onValueChange={(v) => update({ blur: v[0] })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={settings.vignette} onCheckedChange={(v) => update({ vignette: v })} />
          Vignette
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={settings.grain} onCheckedChange={(v) => update({ grain: v })} />
          Film grain
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={settings.kenBurns} onCheckedChange={(v) => update({ kenBurns: v })} />
          Slow zoom (Ken Burns)
        </label>
      </div>

      <div>
        <Label className="mb-2 block">Watermark</Label>
        <div className="mb-2 flex gap-2">
          {(["none", "logo", "text"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update({ watermark: { ...settings.watermark, type: t } })}
              className={`rounded-md border px-3 py-2 text-sm capitalize ${
                settings.watermark.type === t
                  ? "border-accent bg-accent/20"
                  : "border-border bg-card"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {settings.watermark.type === "text" && (
          <Input
            value={settings.watermark.text}
            onChange={(e) =>
              update({ watermark: { ...settings.watermark, text: e.target.value } })
            }
            placeholder="@yourhandle"
            className="mb-2"
          />
        )}
        {settings.watermark.type !== "none" && (
          <div className="flex gap-2">
            {(["tl", "tr", "bl", "br"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  update({ watermark: { ...settings.watermark, position: p } })
                }
                className={`rounded-md border px-3 py-2 text-xs uppercase ${
                  settings.watermark.position === p
                    ? "border-accent bg-accent/20"
                    : "border-border bg-card"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Frame</Label>
        <div className="flex flex-wrap gap-2">
          {(["none", "gold-thin", "arch", "rounded"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => update({ frame: f })}
              className={`rounded-md border px-3 py-2 text-sm ${
                settings.frame === f
                  ? "border-accent bg-accent/20"
                  : "border-border bg-card"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
