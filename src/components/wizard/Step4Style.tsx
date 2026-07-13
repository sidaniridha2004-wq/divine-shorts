import { useProjectState } from "@/lib/project-state";
import { THEMES } from "@/lib/themes";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function Step4Style() {
  const { settings, update } = useProjectState();

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
        <Label className="mb-3 block">Theme</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = settings.themeId === t.id && !settings.customBg;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ themeId: t.id, customBg: null })}
                className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                  active
                    ? "border-accent shadow-gold"
                    : "border-border hover:border-accent/50"
                }`}
              >
                {t.generated === "dark-gradient" && (
                  <div className="absolute inset-0 emerald-gradient" />
                )}
                {t.generated === "gold-particles" && (
                  <div className="absolute inset-0 bg-black">
                    <div className="absolute inset-0 gold-gradient opacity-20" />
                  </div>
                )}
                {t.poster && (
                  <img
                    src={t.poster}
                    alt={t.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-xs font-medium text-white">
                  {t.name}
                </div>
              </button>
            );
          })}
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
