// Pexels API client for fetching video and photo backgrounds dynamically.
//
// SECURITY: this key used to be hardcoded in source. It is now read from the
// environment. Note that VITE_* values are inlined into the public bundle, so
// this must be a free-tier key you can rotate at any time — treat it as
// public, not secret. If you need it truly private, proxy these calls through
// a server function instead.
//
// When no key is configured, searches resolve to empty results rather than
// throwing, so the editor keeps working with the bundled themes.
const PEXELS_API_KEY =
  ((import.meta.env.VITE_PEXELS_API_KEY as string | undefined) ?? "").trim();

export function isPexelsConfigured(): boolean {
  return PEXELS_API_KEY.length > 0;
}

export type PexelsVideo = {
  id: number;
  url: string; // Pexels page URL (for attribution)
  image: string; // poster/thumbnail
  user: { name: string; url: string };
  video_files: {
    id: number;
    quality: string; // "hd", "sd", "uhd"
    file_type: string; // "video/mp4"
    width: number;
    height: number;
    link: string;
  }[];
  duration?: number;
};

export type PexelsPhoto = {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
};

export type PexelsSearchResult = {
  total_results: number;
  page: number;
  per_page: number;
  videos?: PexelsVideo[];
  photos?: PexelsPhoto[];
};

function emptyResult(page: number, perPage: number): PexelsSearchResult {
  return { total_results: 0, page, per_page: perPage, videos: [], photos: [] };
}

/**
 * Search for videos on Pexels. Returns portrait-oriented videos by default
 * which are ideal for 9:16 Quran reels.
 */
export async function searchPexelsVideos(
  query: string,
  opts: { orientation?: "portrait" | "landscape" | "square"; page?: number; perPage?: number } = {},
): Promise<PexelsSearchResult> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 12;
  if (!isPexelsConfigured()) return emptyResult(page, perPage);

  const params = new URLSearchParams({
    query,
    orientation: opts.orientation ?? "portrait",
    page: String(page),
    per_page: String(perPage),
  });

  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) throw new Error(`Pexels API ${res.status}`);
  return res.json();
}

/**
 * Search for photos on Pexels.
 */
export async function searchPexelsPhotos(
  query: string,
  opts: { orientation?: "portrait" | "landscape" | "square"; page?: number; perPage?: number } = {},
): Promise<PexelsSearchResult> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 12;
  if (!isPexelsConfigured()) return emptyResult(page, perPage);

  const params = new URLSearchParams({
    query,
    orientation: opts.orientation ?? "portrait",
    page: String(page),
    per_page: String(perPage),
  });

  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) throw new Error(`Pexels API ${res.status}`);
  return res.json();
}

/**
 * Get the best video file URL from a Pexels video result.
 * Prefers HD quality MP4 in the closest resolution to 1080p.
 */
export function getBestVideoUrl(video: PexelsVideo): string {
  const mp4Files = video.video_files.filter((f) => f.file_type === "video/mp4");
  // Prefer HD quality, then sort by closeness to 1080 height
  const sorted = mp4Files.sort((a, b) => {
    const aScore = a.quality === "hd" ? 0 : a.quality === "sd" ? 1 : 2;
    const bScore = b.quality === "hd" ? 0 : b.quality === "sd" ? 1 : 2;
    if (aScore !== bScore) return aScore - bScore;
    return Math.abs(a.height - 1080) - Math.abs(b.height - 1080);
  });
  return sorted[0]?.link ?? mp4Files[0]?.link ?? "";
}
