import { useState, useEffect } from "react";
import { useProjectState } from "@/lib/project-state";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { exportVideo, type ExportProgress } from "@/lib/export/webcodecs-export";
import { saveProject } from "@/lib/projects-store";
import { buildCaption } from "@/lib/caption";
import { getMp3QuranReciters } from "@/lib/quran-api";
import { generateMetadata, generateAIMetadata, LANGUAGES, PLATFORMS, type LanguageCode, type PlatformCode } from "@/lib/metadata-generator";
import { toast } from "sonner";
import { Download, Save, Copy, Share2, Loader2, Image as ImageIcon, Sparkles } from "lucide-react";
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";

export function Step5Export({ preview }: { preview: React.RefObject<PreviewHandle | null> }) {
  const { settings } = useProjectState();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [output, setOutput] = useState<{ url: string; ext: string } | null>(null);
  
  // YouTube Metadata State
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [platform, setPlatform] = useState<PlatformCode>("youtube");
  const [reciterName, setReciterName] = useState("Unknown Reciter");
  
  const [aiMetadata, setAiMetadata] = useState<{ title: string; description: string; tags: string } | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  
  useEffect(() => {
    getMp3QuranReciters().then(reciters => {
      const found = reciters.find(r => r.id === settings.reciterId);
      if (found) setReciterName(found.name);
    }).catch(console.error);
  }, [settings.reciterId]);

  const baseMetadata = generateMetadata(
    language,
    platform,
    settings.chapterName,
    reciterName,
    settings.fromAyah,
    settings.toAyah
  );
  
  const metadata = aiMetadata || baseMetadata;

  const handleAIGenerate = async () => {
    setIsGeneratingAI(true);
    try {
      const data = await generateAIMetadata(language, platform, settings.chapterName, reciterName, settings.fromAyah, settings.toAyah);
      setAiMetadata(data);
      toast.success("AI Metadata generated successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate metadata");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const doExport = async () => {
    if (!preview.current) return;
    setOutput(null);
    setProgress({ phase: "preparing", progress: 0.02 });
    try {
      const { blob, ext } = await exportVideo(preview.current, setProgress, settings);
      const url = URL.createObjectURL(blob);
      setOutput({ url, ext });
      toast.success(`Exported as .${ext}`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed: " + (e as Error).message);
      setProgress(null);
    }
  };

  const doSave = () => {
    const id = crypto.randomUUID();
    saveProject({
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: { ...settings },
    });
    toast.success("Saved to My Projects");
  };

  const copyCaption = async () => {
    const caption = buildCaption(
      settings.chapterName,
      settings.fromAyah,
      settings.toAyah,
      settings.chapterId,
    );
    await navigator.clipboard.writeText(caption);
    toast.success("Caption copied");
  };

  const shareLink = async () => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(settings)));
    const url = `${window.location.origin}/create?p=${encoded}`;
    await navigator.clipboard.writeText(url);
    toast.success("Preview link copied");
  };

  const downloadThumbnail = async () => {
    if (!preview.current) return;
    const dataUrl = await preview.current.captureThumbnail();
    if (!dataUrl) {
      toast.error("Could not capture thumbnail");
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `thumbnail-${settings.chapterId}-${settings.fromAyah}.jpg`;
    a.click();
    toast.success("Thumbnail downloaded");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-2 block">Aspect ratio</Label>
          <div className="flex flex-wrap gap-2">
            {(["9:16", "1:1", "16:9", "4:5"] as const).map((a) => (
              <AspectBtn key={a} value={a} />
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Resolution</Label>
          <div className="flex gap-2">
            {[720, 1080].map((r) => (
              <ResBtn key={r} value={r as 720 | 1080} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Export video</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Recording plays the audio through your speakers. Keep this tab focused for best
          results.
        </p>
        {progress && progress.phase !== "done" && (
          <div className="mb-3">
            <Progress value={progress.progress * 100} />
            <div className="mt-1 text-xs text-muted-foreground">
              {progress.message ?? progress.phase} — {Math.round(progress.progress * 100)}%
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={doExport} disabled={!!progress && progress.phase !== "done"} size="lg">
            {progress && progress.phase !== "done" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" /> Render video
              </>
            )}
          </Button>
          {output && (
            <a
              href={output.url}
              download={`quranreels-${settings.chapterId}-${settings.fromAyah}.${output.ext}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              <Download className="mr-2 h-4 w-4" />
              Download .{output.ext}
            </a>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Social Media Assets</div>
            <p className="text-xs text-muted-foreground">Generate localized metadata and thumbnail</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={platform} onValueChange={(v) => { setPlatform(v as PlatformCode); setAiMetadata(null); }}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={language} onValueChange={(v) => { setLanguage(v as LanguageCode); setAiMetadata(null); }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAIGenerate} disabled={isGeneratingAI}>
              {isGeneratingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-yellow-500" />}
              AI Write
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs">Title</Label>
            <div className="flex gap-2">
              <Input readOnly value={metadata.title} />
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(metadata.title);
                  toast.success("Title copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Description</Label>
            <div className="relative">
              <Textarea readOnly value={metadata.description} rows={5} className="resize-none pr-10" />
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8"
                onClick={() => {
                  navigator.clipboard.writeText(metadata.description);
                  toast.success("Description copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Tags</Label>
            <div className="flex gap-2">
              <Input readOnly value={metadata.tags} />
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(metadata.tags);
                  toast.success("Tags copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <Button onClick={downloadThumbnail} variant="outline" className="w-full">
            <ImageIcon className="mr-2 h-4 w-4" /> Download Thumbnail
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={doSave}>
          <Save className="mr-2 h-4 w-4" /> Save to My Projects
        </Button>
        <Button variant="outline" onClick={copyCaption}>
          <Copy className="mr-2 h-4 w-4" /> Copy short caption
        </Button>
        <Button variant="outline" onClick={shareLink}>
          <Share2 className="mr-2 h-4 w-4" /> Share preview link
        </Button>
      </div>
    </div>
  );
}

function AspectBtn({ value }: { value: "9:16" | "1:1" | "16:9" | "4:5" }) {
  const { settings, update } = useProjectState();
  return (
    <button
      type="button"
      onClick={() => update({ aspect: value })}
      className={`rounded-md border px-3 py-2 text-sm ${
        settings.aspect === value ? "border-accent bg-accent/20" : "border-border bg-card"
      }`}
    >
      {value}
    </button>
  );
}
function ResBtn({ value }: { value: 720 | 1080 }) {
  const { settings, update } = useProjectState();
  return (
    <button
      type="button"
      onClick={() => update({ resolution: value })}
      className={`rounded-md border px-3 py-2 text-sm ${
        settings.resolution === value ? "border-accent bg-accent/20" : "border-border bg-card"
      }`}
    >
      {value}p
    </button>
  );
}
