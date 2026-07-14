import { useProjectState } from "@/lib/project-state";
import { TRANSLATIONS, ARABIC_FONTS } from "@/lib/translations";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export function Step3Text() {
  const { settings, update } = useProjectState();
  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Arabic font</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ARABIC_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => update({ arabicFont: f.id })}
              className={`rounded-lg border p-3 text-center transition ${
                settings.arabicFont === f.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card hover:border-accent/50"
              }`}
            >
              <div dir="rtl" style={{ fontFamily: f.css }} className="mb-1 text-2xl">
                بِسْمِ اللَّهِ
              </div>
              <div className="text-xs text-muted-foreground">{f.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-2 block">Arabic size: {settings.arabicSize}px</Label>
          <Slider
            value={[settings.arabicSize]}
            min={32}
            max={96}
            step={2}
            onValueChange={(v) => update({ arabicSize: v[0] })}
          />
        </div>
        <div>
          <Label className="mb-2 block">Text color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.textColor}
              onChange={(e) => update({ textColor: e.target.value })}
              className="h-10 w-16 rounded border border-border bg-transparent"
            />
            <Input
              value={settings.textColor}
              onChange={(e) => update({ textColor: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Letter spacing: {settings.letterSpacing}</Label>
          <Slider
            value={[settings.letterSpacing]}
            min={-2}
            max={10}
            step={0.5}
            onValueChange={(v) => update({ letterSpacing: v[0] })}
          />
        </div>
        <div>
          <Label className="mb-2 block">Line height: {settings.lineHeight.toFixed(1)}</Label>
          <Slider
            value={[settings.lineHeight * 10]}
            min={12}
            max={30}
            step={1}
            onValueChange={(v) => update({ lineHeight: v[0] / 10 })}
          />
        </div>
        <div>
          <Label className="mb-2 block">Max width: {settings.maxWidthPct}%</Label>
          <Slider
            value={[settings.maxWidthPct]}
            min={40}
            max={95}
            step={1}
            onValueChange={(v) => update({ maxWidthPct: v[0] })}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={settings.textShadow}
              onCheckedChange={(v) => update({ textShadow: v })}
            />
            Text shadow
          </label>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Translation</Label>
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.translationId !== null}
            onCheckedChange={(v) => update({ translationId: v ? 20 : null })}
          />
          <select
            disabled={settings.translationId === null}
            className="h-10 flex-1 rounded-md border border-border bg-input px-3 text-sm disabled:opacity-40"
            value={settings.translationId ?? ""}
            onChange={(e) => update({ translationId: Number(e.target.value) })}
          >
            {TRANSLATIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={settings.showTransliteration}
            onCheckedChange={(v) => update({ showTransliteration: v })}
          />
          Show transliteration
        </label>
        
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={settings.showAyahNumber}
            onCheckedChange={(v) => update({ showAyahNumber: v })}
          />
          Show Ayah number ﴿١﴾
        </label>
        
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={settings.encloseInBrackets}
            onCheckedChange={(v) => update({ encloseInBrackets: v })}
          />
          Enclose in ornate brackets ﴿ ﴾
        </label>
      </div>

      <div>
        <Label className="mb-2 block">Layout</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { id: "centered", label: "Centered stack" },
            { id: "arabic-only", label: "Arabic only" },
            { id: "bottom-third", label: "Bottom third" },
            { id: "split", label: "Split top/bottom" },
          ].map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => update({ layout: l.id as never })}
              className={`rounded-md border p-3 text-xs ${
                settings.layout === l.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card hover:border-accent/50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Animation style</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { id: "fade", label: "Fade" },
            { id: "word-fade", label: "Word fade" },
            { id: "typewriter", label: "Typewriter" },
            { id: "slide-up", label: "Slide up" },
            { id: "scale-glow", label: "Scale glow" },
          ].map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => update({ animation: a.id as never })}
              className={`rounded-md border p-2 text-xs ${
                settings.animation === a.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card hover:border-accent/50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Label className="mb-2 block text-xs">
            Animation speed: {settings.animationSpeed.toFixed(1)}x
          </Label>
          <Slider
            value={[settings.animationSpeed * 10]}
            min={5}
            max={20}
            step={1}
            onValueChange={(v) => update({ animationSpeed: v[0] / 10 })}
          />
        </div>
      </div>
    </div>
  );
}
