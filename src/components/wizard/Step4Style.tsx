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
import { Shuffle, Search, Loader2, Play, Pause } from "lucide-react";
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

// Tap target that toggles an inline clip preview without selecting the tile.
// Hover previews only work with a mouse -- onMouseEnter never fires on a phone --
// so every video tile also gets this badge. It is a sibling of the tile button
// rather than a child because nesting a button inside a button is invalid HTML.
function PreviewBadge({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={active ? "Stop preview" : "Preview clip"}
      className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
    >
      {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  );
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

  const [mediaProvider, setMediaProvider] = useState<"pexels" | "pixabay">("pexels");
  const [matchDuration, setMatchDuration] = useState(false);
  const [audioLength, setAudioLength] = useState(0);
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsType, setPexelsType] = useState<"video" | "photo">("video");
  const [pexelsVideoResults, setPexelsVideoResults] = useState<PexelsVideo[]>([]);
  const [pexelsPhotoResults, setPexelsPhotoResults] = useState<PexelsPhoto[]>([]);
  const [pixabayVideoResults, setPixabayVideoResults] = useState<PixabayVideo[]>([]);
  const [pixabayPhotoResults, setPixabayPhotoResults] = useState<PixabayPhoto[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsHoverId, setPexelsHoverId] = useState<number | null>(null);
  const [selectedPexelsId, setSelectedPexelsId] = useState<number | null>(null);
  const [selectedAyah, setSelectedAyah] = useState<number | null>(null);
  // Tap-to-preview: only one clip plays at a time, on stock results and on the
  // built-in theme grid.
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [themePreviewId, setThemePreviewId] = useState<string | null>(null);

  // Initialize selectedAyah if per-ayah mode is active
  useEffect(() => {
    if (settings.bgMode === "per-ayah" && selectedAyah === null) {
      setSelectedAyah(settings.fromAyah);
      setPexelsType("photo");
    }
  }, [settings.bgMode, selectedAyah, settings.fromAyah]);

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
    setPreviewId(null);
    try {
      let minDuration = 0;
      if (matchDur && type === "video" && settings.chapterId && settings.reciterId && settings.fromAyah && settings.toAyah) {
        const timings = await getAyahTimings(settings.chapterId, settings.reciterId);
        const startAyah = timings.find((t) => t.ayah === settings.fromAyah);
        const endAyah = timings.find((t) => t.ayah === settings.toAyah);
        if (startAyah && endAyah) {
          minDuration = (endAyah.end_time - startAyah.start_time) / 1000;
          if (settings.audioSpeed) minDuration /= settings.audioSpeed;
          setAudioLength(minDuration);
        } else {
          setAudioLength(0);
        }
      } else {
        setAudioLength(0);
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
    if (settings.bgMode === "per-ayah" && selectedAyah !== null) {
      update({ ayahBgs: { ...settings.ayahBgs, [selectedAyah]: photo.src.large2x } });
      toast.success(`Ayah ${selectedAyah}: Pexels photo`);
    } else {
      update({ customBg: photo.src.large2x });
      setSelectedPexelsId(photo.id);
      toast.success(`Background: Pexels photo by ${photo.photographer}`);
    }
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
    if (settings.bgMode === "per-ayah" && selectedAyah !== null) {
      update({ ayahBgs: { ...settings.ayahBgs, [selectedAyah]: photo.largeImageURL } });
      toast.success(`Ayah ${selectedAyah}: Pixabay photo`);
    } else {
      update({ customBg: photo.largeImageURL });
      setSelectedPexelsId(photo.id);
      toast.success(`Background: Pixabay photo by ${photo.user}`);
    }
  };

  // Load initial suggestions on mount
  useEffect(() => {
    const randomSuggestion = PEXELS_SUGGESTIONS[Math.floor(Math.random() * PEXELS_SUGGESTIONS.length)];
    setPexelsQuery(randomSuggestion);
    searchMedia(randomSuggestion, pexelsType, mediaProvider, matchDuration);
  }, [searchMedia]); // deliberately omit dependencies so it only runs once

  return (
    <div className="space-y-6">
      {/* ── Background Mode ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <Label>Background Mode</Label>
          <div className="flex gap-2">
            {(["global", "per-ayah"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  update({ bgMode: mode });
                  if (mode === "per-ayah") {
                    setPexelsType("photo"); // Force photo search
                    setSelectedAyah(settings.fromAyah);
                    if (pexelsQuery) searchMedia(pexelsQuery, "photo", mediaProvider, false);
                  }
                }}
                className={`rounded-md border px-4 py-1.5 text-xs capitalize transition ${
                  settings.bgMode === mode
                    ? "border-accent bg-accent/20 text-accent font-medium"
                    : "border-border bg-card text-muted-foreground hover:border-accent/50"
                }`}
              >
                {mode.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
        
        {settings.bgMode === "per-ayah" && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Select Ayah to customize</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: settings.toAyah - settings.fromAyah + 1 }, (_, i) => settings.fromAyah + i).map(ayahNum => (
                <button
                  key={ayahNum}
                  type="button"
                  onClick={() => setSelectedAyah(ayahNum)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${
                    selectedAyah === ayahNum
                      ? "border-accent bg-accent text-black font-medium shadow-gold"
                      : settings.ayahBgs[ayahNum] 
                        ? "border-accent/50 bg-accent/10 text-accent" 
                        : "border-border bg-card text-muted-foreground hover:border-accent/50"
                  }`}
                >
                  Ayah {ayahNum}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
                disabled={settings.bgMode === "per-ayah" && t === "video"}
                onClick={() => {
                  setPexelsType(t);
                  if (pexelsQuery) searchMedia(pexelsQuery, t, mediaProvider, matchDuration);
                }}
                className={`rounded-md border px-4 py-1.5 text-xs capitalize transition ${
                  pexelsType === t
                    ? "border-accent bg-accent/20 text-accent font-medium"
                    : "border-border bg-card text-muted-foreground hover:border-accent/50"
                } ${settings.bgMode === "per-ayah" && t === "video" ? "opacity-30 cursor-not-allowed" : ""}`}
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
                  Match Audio Length {matchDuration && audioLength > 0 ? `(>= ${Math.ceil(audioLength)}s)` : ""}
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
        {pexelsType === "video" && (pexelsVideoResults.length > 0 || pixabayVideoResults.length > 0) && (
          <p className="mb-3 text-[10px] text-muted-foreground">
            Tap the play badge to preview a clip. Tap the tile to use it as your background.
          </p>
        )}
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
              const previewing = previewId === video.id;
              const showVideo = hovering || previewing;
              const videoUrl = getBestVideoUrl(video);
              return (
                <div key={video.id} className="relative">
                  <button
                    type="button"
                    onClick={() => selectPexelsVideo(video)}
                    onMouseEnter={() => setPexelsHoverId(video.id)}
                    onMouseLeave={() => setPexelsHoverId((h) => (h === video.id ? null : h))}
                    className={`group relative block aspect-[9/16] w-full overflow-hidden rounded-xl border transition ${
                      active
                        ? "border-accent shadow-gold"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    {!showVideo && (
                      <img
                        src={video.image}
                        alt={`Video by ${video.user.name}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {showVideo && videoUrl && (
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
                  {videoUrl && (
                    <PreviewBadge
                      active={previewing}
                      onToggle={() => setPreviewId((p) => (p === video.id ? null : video.id))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {!pexelsLoading && mediaProvider === "pixabay" && pexelsType === "video" && pixabayVideoResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pixabayVideoResults.map((video) => {
              const active = selectedPexelsId === video.id;
              const hovering = pexelsHoverId === video.id;
              const previewing = previewId === video.id;
              const showVideo = hovering || previewing;
              const videoUrl = getBestPixabayVideoUrl(video);
              return (
                <div key={video.id} className="relative">
                  <button
                    type="button"
                    onClick={() => selectPixabayVideo(video)}
                    onMouseEnter={() => setPexelsHoverId(video.id)}
                    onMouseLeave={() => setPexelsHoverId((h) => (h === video.id ? null : h))}
                    className={`group relative block aspect-[9/16] w-full overflow-hidden rounded-xl border transition ${
                      active
                        ? "border-accent shadow-gold"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    {!showVideo && (
                      <img
                        src={video.videos?.tiny?.thumbnail || video.videos?.small?.thumbnail || `https://i.vimeocdn.com/video/${video.picture_id}_295x166.jpg`}
                        alt={`Video by ${video.user}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {showVideo && videoUrl && (
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
                  {videoUrl && (
                    <PreviewBadge
                      active={previewing}
                      onToggle={() => setPreviewId((p) => (p === video.id ? null : video.id))}
                    />
                  )}
                </div>
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
            const previewing = themePreviewId === t.id;
            const showVideo = !!t.video && (hovering || previewing);
            return (
              <div key={t.id} className="relative">
                <button
                  type="button"
                  onClick={() => { update({ themeId: t.id, customBg: null }); setSelectedPexelsId(null); }}
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                  className={`group relative block aspect-[9/16] w-full overflow-hidden rounded-xl border transition ${
                    active
                      ? "border-accent shadow-gold"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  {t.generated && (
                    <div className="absolute inset-0" style={generatedStyle(t.generated)} />
                  )}
                  {t.poster && !showVideo && (
                    <img
                      src={t.poster}
                      alt={t.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {showVideo && (
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
                {t.video && (
                  <PreviewBadge
                    active={previewing}
                    onToggle={() => setThemePreviewId((p) => (p === t.id ? null : t.id))}
                  />
                )}
              </div>
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

      <div className="mt-6 mb-6 rounded-xl border bg-card p-4">
        <Label className="mb-4 block font-semibold text-accent">Background Position & Crop</Label>
        {settings.bgMode === "per-ayah" && selectedAyah !== null && (
          <p className="mb-4 text-xs text-muted-foreground">Adjusting crop for Ayah {selectedAyah} specifically.</p>
        )}
        <div className="grid gap-6 sm:grid-cols-3">
          {(() => {
            const transform = settings.bgMode === "per-ayah" && selectedAyah
              ? (settings.ayahTransforms?.[selectedAyah] || { zoom: 1, x: 0, y: 0 })
              : { zoom: settings.bgZoom || 1, x: settings.bgPanX || 0, y: settings.bgPanY || 0 };

            const updateTransform = (key: 'zoom'|'x'|'y', val: number) => {
              if (settings.bgMode === "per-ayah" && selectedAyah) {
                update({
                  ayahTransforms: {
                    ...settings.ayahTransforms,
                    [selectedAyah]: { ...transform, [key]: val }
                  }
                });
              } else {
                if (key === 'zoom') update({ bgZoom: val });
                if (key === 'x') update({ bgPanX: val });
                if (key === 'y') update({ bgPanY: val });
              }
            };

            return (
              <>
                <div>
                  <Label className="mb-2 block text-xs">Zoom ({transform.zoom.toFixed(2)}x)</Label>
                  <Slider
                    value={[transform.zoom]}
                    min={1}
                    max={3}
                    step={0.05}
                    onValueChange={(v) => updateTransform('zoom', v[0])}
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-xs">Pan X ({transform.x}%)</Label>
                  <Slider
                    value={[transform.x]}
                    min={-100}
                    max={100}
                    step={1}
                    onValueChange={(v) => updateTransform('x', v[0])}
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-xs">Pan Y ({transform.y}%)</Label>
                  <Slider
                    value={[transform.y]}
                    min={-100}
                    max={100}
                    step={1}
                    onValueChange={(v) => updateTransform('y', v[0])}
                  />
                </div>
              </>
            );
          })()}
        </div>
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
          {(["none", "gold-thin", "arch", "rounded", "blurred-glass", "rounded-square", "blurred-glass-square"] as const).map((f) => (
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
              {f === "none" ? "Full Screen" : f === "gold-thin" ? "Gold Border" : f === "rounded" ? "Narrow (Black)" : f === "blurred-glass" ? "Narrow (Blurred)" : f === "rounded-square" ? "Square (Black)" : f === "blurred-glass-square" ? "Square (Blurred)" : "Arch Window"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
