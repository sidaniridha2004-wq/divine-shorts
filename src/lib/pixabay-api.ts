// VITE_* keys are public in the client bundle. Use a server proxy for private credentials.
const PIXABAY_API_KEY = ((import.meta.env?.VITE_PIXABAY_API_KEY as string | undefined) ?? "").trim();
const PIXABAY_VIDEO_ENDPOINT = "https://pixabay.com/api/videos/";
const PIXABAY_PHOTO_ENDPOINT = "https://pixabay.com/api/";
export function isPixabayConfigured(): boolean { return PIXABAY_API_KEY.length > 0; }
export type PixabayVideoFile = { url: string; width: number; height: number; size: number; thumbnail: string };
export type PixabayVideo = {
  id: number; pageURL: string; type: string; tags: string; duration: number; picture_id: string;
  videos: { large?: PixabayVideoFile; medium?: PixabayVideoFile; small?: PixabayVideoFile; tiny?: PixabayVideoFile };
  user: string; userImageURL: string;
};
export type PixabayPhoto = {
  id: number; pageURL: string; type: string; tags: string; previewURL: string; webformatURL: string;
  largeImageURL: string; imageWidth: number; imageHeight: number; user: string; userImageURL: string;
};
export type PixabaySearchResult<THit> = { total: number; totalHits: number; hits: THit[] };

export async function searchPixabayVideos(query: string, opts: { page?: number; perPage?: number } = {}): Promise<{ videos: PixabayVideo[] }> {
  if (!isPixabayConfigured()) return { videos: [] };
  const params = new URLSearchParams({ key: PIXABAY_API_KEY, q: query, page: String(opts.page ?? 1), per_page: String(opts.perPage ?? 50), safesearch: "true" });
  const res = await fetch(PIXABAY_VIDEO_ENDPOINT + "?" + params.toString());
  if (!res.ok) throw new Error("Pixabay API error: " + res.status);
  const data = await res.json() as PixabaySearchResult<PixabayVideo>;
  return { videos: data.hits ?? [] };
}

export async function searchPixabayPhotos(query: string, opts: { page?: number; perPage?: number; orientation?: "vertical" | "horizontal" } = {}): Promise<{ photos: PixabayPhoto[] }> {
  if (!isPixabayConfigured()) return { photos: [] };
  const params = new URLSearchParams({ key: PIXABAY_API_KEY, q: query, orientation: opts.orientation ?? "vertical", page: String(opts.page ?? 1), per_page: String(opts.perPage ?? 50), safesearch: "true" });
  const res = await fetch(PIXABAY_PHOTO_ENDPOINT + "?" + params.toString());
  if (!res.ok) throw new Error("Pixabay API error: " + res.status);
  const data = await res.json() as PixabaySearchResult<PixabayPhoto>;
  return { photos: data.hits ?? [] };
}

/** Prefer an actual API-provided <=1080p rendition within an 80 MiB budget.
 * The old large-first selection picked 4K/334 MB originals for 1080p reels.
 * Never manufacture a URL by replacing '_large' with '_medium'.
 */
export function getBestPixabayVideoUrl(video: PixabayVideo): string {
  const files = Object.values(video.videos).filter((f): f is PixabayVideoFile => !!f?.url && f.width > 0 && f.height > 0);
  if (!files.length) return "";
  const withinBudget = files.filter(f => f.size > 0 && f.size <= 80 * 1024 * 1024 && Math.max(f.width, f.height) <= 1920);
  if (withinBudget.length) {
    return withinBudget.sort((a, b) => b.width * b.height - a.width * a.height || a.size - b.size)[0].url;
  }
  // If every rendition is oversized/has incomplete metadata, use the smallest
  // real rendition rather than silently upgrading to the largest original.
  return files.sort((a, b) => (a.size > 0 ? a.size : Infinity) - (b.size > 0 ? b.size : Infinity) || a.width * a.height - b.width * b.height)[0].url;
}

const resolved = new Map<string, { url: string; expires: number }>();

/** Resolve legacy saved/shared '_large.mp4' selections through Pixabay's API.
 * The project remains portable: stored URLs are not blindly rewritten.
 */
export async function resolvePixabayVideoUrl(source: string, signal?: AbortSignal): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(source); } catch { return source; }
  const match = parsed.pathname.match(/\/(\d+)_large\.mp4$/i);
  if (parsed.protocol !== "https:" || parsed.hostname !== "cdn.pixabay.com" || !match || !isPixabayConfigured()) return source;
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  const cached = resolved.get(source);
  if (cached && cached.expires > Date.now()) return cached.url;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 8_000);
  try {
    const params = new URLSearchParams({ key: PIXABAY_API_KEY, id: match[1], safesearch: "true" });
    const response = await fetch(PIXABAY_VIDEO_ENDPOINT + "?" + params.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error("Pixabay could not provide a smaller video (" + response.status + "). Please retry.");
    const data = await response.json() as PixabaySearchResult<PixabayVideo>;
    const clip = data.hits?.find(hit => String(hit.id) === match[1]);
    const url = clip ? getBestPixabayVideoUrl(clip) : "";
    if (!url) throw new Error("This Pixabay video is no longer available. Choose another background.");
    if (controller.signal.aborted) throw new DOMException("Video lookup cancelled", "AbortError");
    if (resolved.size >= 50) resolved.delete(resolved.keys().next().value!);
    resolved.set(source, { url, expires: Date.now() + 30 * 60_000 });
    return url;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
