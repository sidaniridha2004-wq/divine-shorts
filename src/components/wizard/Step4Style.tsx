import { useMemo, useState, useCallback, useEffect, type CSSProperties } from "react";
import { useProjectState } from "@/lib/project-state";
import { THEMES, THEME_CATEGORIES, type GeneratedTheme } from "@/lib/themes";
import { searchPexelsVideos, searchPexelsPhotos, getBestVideoUrl, type PexelsVideo, type PexelsPhoto } from "@/lib/pexels-api";
import { searchPixabayVideos, searchPixabayPhotos, getBestPixabayVideoUrl, type PixabayVideo, type PixabayPhoto } from "@/lib/pixabay-api";
import { getAyahTimings } from "@/lib/quran-api";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Shuffle, Search, Loader2 } from "lucide-react";
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

// Suggested search queries for Islamic / cinematic backgrounds
const PEXELS_SUGGESTIONS = [
  "mosque", "night sky stars", "rain window", "ocean waves", "desert sand",
  "clouds timelapse", "forest fog", "candle flame", "sunset golden",
  "snow falling", "waterfall", "mountain landscape", "galaxy space",
  "aurora borealis", "lantern light", "abstract dark", "bokeh lights",
  "water ripple", "fire flames", "nature aerial",
];

export function Step4Style() {
  const { settings, update } = useProjectState();
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Media search state
  const [mediaProvider, setMediaProvider] = useState<"pexels" | "pixabay">("pexels");
  const [matchDuration, setMatchDuration] = useState(false);
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsType, setPexelsType] = useState<"video" | "photo">("video");
  const [pexelsVideoResults, setPexelsVideoResults] = useState<PexelsVideo[]>([]);
  const [pexelsPhotoResults, setPexelsPhotoResults] = useState<PexelsPhoto[]>([]);
  const [pixabayVideoResults, setPixabayVideoResults] = useState<PixabayVideo[]>([]);
  const [pixabayPhotoResults, setPixabayPhotoResults] = useState<PixabayPhoto[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsHoverId, setPexelsHoverId] = useState<number | null>(null);
  const [selectedPexelsId, setSelectedPexelsId] = useState<number | null>(null);

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
    setSelectedPexelsId(null);
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

  // Media search handler
  const searchMedia = useCallback(async (query: string, type: "video" | "photo", provider: "pexels" | "pixabay", matchDur: boolean) => {
    if (!query.trim()) return;
    setPexelsLoading(true);
    try {
      let minDuration = 0;
      if (matchDur && type === "video" && settings.chapterId && settings.reciterId && settings.fromAyah && settings.toAyah) {
        const timings = await getAyahTimings(settings.chapterId, settings.reciterId);
        const startAyah = timings.find((t) => t.ayah === settings.fromAyah);
        const endAyah = timings.find((t) => t.ayah === settings.toAyah);
        if (startAyah && endAyah) {
          minDuration = (endAyah.end_time - startAyah.start_time) / 1000;
          if (settings.audioSpeed) minDuration /= settings.audioSpeed;
        }
      }

      if (provider === "pexels") {
        if (type === "video") {
          const result = await searchPexelsVideos(query, { orientation: "portrait", perPage: 50 });
          let videos = result.videos || [];
          if (minDuration > 0) videos = videos.filter((v) => (v.duration || 0) >= minDuration);
          setPexelsVideoResults(videos);
          if (!videos.length) toast.info(minDuration > 0 ? "No Pexels videos found matching the required length" : "No Pexels videos found");
        } else {
          const result = await searchPexelsPhotos(query, { orientation: "portrait", perPage: 50 });
          setPexelsPhotoResults(result.photos || []);
          if (!result.photos?.length) toast.info("No Pexels photos found");
        }
      } else {
        if (type === "video") {
          const result = await searchPixabayVideos(query, { perPage: 50 });
          let videos = result.videos || [];
          if (minDuration > 0) videos = videos.filter((v) => (v.duration || 0) >= minDuration);
          setPixabayVideoResults(videos);
          if (!videos.length) toast.info(minDuration > 0 ? "No Pixabay videos found matching the required length" : "No Pixabay videos found");
        } else {
          const result = await searchPixabayPhotos(query, { orientation: "vertical", perPage: 50 });
          setPixabayPhotoResults(result.photos || []);
          if (!result.photos?.length) toast.info("No Pixabay photos found");
        }
      }
    } catch (err) {
      toast.error(`Failed to search media`);
      console.error(err);
    } finally {
      setPexelsLoading(false);
    }
  }, [settings.chapterId, settings.reciterId, settings.fromAyah, settings.toAyah, settings.audioSpeed]);

  const handlePexelsSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchMedia(pexelsQuery, pexelsType, mediaProvider, matchDuration);
  };

  const selectPexelsVideo = (video: PexelsVideo) => {
    const videoUrl = getBestVideoUrl(video);
    if (!videoUrl) {
      toast.error("No suitable video file found");
      return;
    }
    update({ customBg: videoUrl });
    setSelectedPexelsId(video.id);
    toast.success(`Background: Pexels video by ${video.user.name}`);
  };

  const selectPexelsPhoto = (photo: PexelsPhoto) => {
    update({ customBg: photo.src.large2x });
    setSelectedPexelsId(photo.id);
    toast.success(`Background: Pexels photo by ${photo.photographer}`);
  };

  const selectPixabayVideo = (video: PixabayVideo) => {
    const videoUrl = getBestPixabayVideoUrl(video);
    if (!videoUrl) {
      toast.error("No suitable video file found");
      return;
    }
    update({ customBg: videoUrl });
    setSelectedPexelsId(video.id);
    toast.success(`Background: Pixabay video by ${video.user}`);
  };

  const selectPixabayPhoto = (photo: PixabayPhoto) => {
    update({ customBg: photo.largeImageURL });
    setSelectedPexelsId(photo.id);
    toast.success(`Background: Pixabay photo by ${photo.user}`);
  };

  // Load initial suggestions on mount
  useEffect(() => {
    const randomSuggestion = PEXELS_SUGGESTIONS[Math.floor(Math.random() * PEXELS_SUGGESTIONS.length)];
    setPexelsQuery(randomSuggestion);
    searchMedia(randomSuggestion, pexelsType, mediaProvider, matchDuration);
  }, [searchMedia]); // deliberately omit dependencies so it only runs once

  return (
    <div className="space-y-6">
      {/* ── Media Search ─────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2">
            <Search className="h-4 w-4 text-accent" />
            Search Media Library
          </Label>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
            Powered by {mediaProvider === "pexels" ? "Pexels" : "Pixabay"}
          </span>
        </div>
        
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(["video", "photo"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPexelsType(t);
                  if (pexelsQuery) searchMedia(pexelsQuery, t, mediaProvider, matchDuration);
                }}
                className={`rounded-md border px-4 py-1.5 text-xs capitalize transition ${
                  pexelsType === t
                    ? "border-accent bg-accent/20 text-accent font-medium"
                    : "border-border bg-card text-muted-foreground hover:border-accent/50"
                }`}
              >
                {t}s
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {pexelsType === "video" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="match-duration"
                  checked={matchDuration}
                  onCheckedChange={(c) => {
                    setMatchDuration(c);
                    if (pexelsQuery) searchMedia(pexelsQuery, pexelsType, mediaProvider, c);
                  }}
                />
                <Label htmlFor="match-duration" className="text-xs cursor-pointer">
                  Match Audio Length
                </Label>
              </div>
            )}
            <div className="flex gap-2">
              {(["pexels", "pixabay"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setMediaProvider(p);
                    if (pexelsQuery) searchMedia(pexelsQuery, pexelsType, p, matchDuration);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider transition ${
                    mediaProvider === p
                      ? "border-accent bg-accent text-black"
                      : "border-border bg-card text-muted-foreground hover:border-accent/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handlePexelsSearch} className="mb-3 flex gap-2">
          <Input
            value={pexelsQuery}
            onChange={(e) => setPexelsQuery(e.target.value)}
            placeholder={`Search ${pexelsType}s… (e.g. mosque, rain, stars)`}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={pexelsLoading || !pexelsQuery.trim()}>
            {pexelsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PEXELS_SUGGESTIONS.slice(0, 10).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setPexelsQuery(s); searchMedia(s, pexelsType, mediaProvider, matchDuration); }}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition ${
                pexelsQuery === s
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-card text-muted-foreground hover:border-accent/50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {pexelsLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <span className="ml-2 text-sm text-muted-foreground">Searching {mediaProvider === "pexels" ? "Pexels" : "Pixabay"}…</span>
          </div>
        )}
        {!pexelsLoading && mediaProvider === "pexels" && pexelsType === "video" && pexelsVideoResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pexelsVideoResults.map((video) => {
              const active = selectedPexelsId === video.id;
              const hovering = pexelsHoverId === video.id;
              const videoUrl = getBestVideoUrl(video);
              return (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => selectPexelsVideo(video)}
                  onMouseEnter={() => setPexelsHoverId(video.id)}
                  onMouseLeave={() => setPexelsHoverId((h) => (h === video.id ? null : h))}
                  className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                    active
                      ? "border-accent shadow-gold"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  {!hovering && (
                    <img
                      src={video.image}
                      alt={`Video by ${video.user.name}`}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {hovering && videoUrl && (
                    <video
                      src={videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-[10px] font-medium text-white">
                    📷 {video.user.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        
        {!pexelsLoading && mediaProvider === "pixabay" && pexelsType === "video" && pixabayVideoResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pixabayVideoResults.map((video) => {
              const active = selectedPexelsId === video.id;
              const hovering = pexelsHoverId === video.id;
              const videoUrl = getBestPixabayVideoUrl(video);
              return (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => selectPixabayVideo(video)}
                  onMouseEnter={() => setPexelsHoverId(video.id)}
                  onMouseLeave={() => setPexelsHoverId((h) => (h === video.id ? null : h))}
                  className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                    active
                      ? "border-accent shadow-gold"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  {!hovering && (
                    <img
                      src={`https://i.vimeocdn.com/video/${video.picture_id}_295x166.jpg`}
                      alt={`Video by ${video.user}`}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {hovering && videoUrl && (
                    <video
                      src={videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-[10px] font-medium text-white">
                    📷 {video.user}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        
        {!pexelsLoading && mediaProvider === "pexels" && pexelsType === "photo" && pexelsPhotoResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pexelsPhotoResults.map((photo) => {
              const active = selectedPexelsId === photo.id;
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => selectPexelsPhoto(photo)}
                  className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                    active
                      ? "border-accent shadow-gold"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <img
                    src={photo.src.large}
                    alt={`Photo by ${photo.photographer}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-[10px] font-medium text-white">
                    📷 {photo.photographer}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!pexelsLoading && mediaProvider === "pixabay" && pexelsType === "photo" && pixabayPhotoResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pixabayPhotoResults.map((photo) => {
              const active = selectedPexelsId === photo.id;
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => selectPixabayPhoto(photo)}
                  className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition ${
                    active
                      ? "border-accent shadow-gold"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <img
                    src={photo.largeImageURL}
                    alt={`Photo by ${photo.user}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-[10px] font-medium text-white">
                    📷 {photo.user}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Built-in Themes ─────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Label>Built-in Themes ({THEMES.length} backgrounds)</Label>
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
          placeholder="Search built-in backgrounds…"
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
                onClick={() => { update({ themeId: t.id, customBg: null }); setSelectedPexelsId(null); }}
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
            onClick={() => { update({ customBg: null }); setSelectedPexelsId(null); }}
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
