// Pixabay API client for fetching video and photo backgrounds dynamically.
//
// SECURITY: VITE_* values are inlined into the public bundle, so this key is
// effectively public. Use a free-tier key you can rotate at any time, or proxy
// these calls through a server function if you need it kept private.
//
// When no key is configured, searches resolve to empty results rather than
// throwing, so the editor keeps working with the bundled themes.

const PIXABAY_API_KEY = (
  (import.meta.env.VITE_PIXABAY_API_KEY as string | undefined) ?? ""
).trim();

const PIXABAY_VIDEO_ENDPOINT = "https://pixabay.com/api/videos/";
const PIXABAY_PHOTO_ENDPOINT = "https://pixabay.com/api/";

export function isPixabayConfigured(): boolean {
  return PIXABAY_API_KEY.length > 0;
}

export type PixabayVideoFile = {
  url: string;
  width: number;
  height: number;
  size: number;
  thumbnail: string;
};

export type PixabayVideo = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  picture_id: string;
  videos: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
  user: string;
  userImageURL: string;
};

export type PixabayPhoto = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  userImageURL: string;
};

export type PixabaySearchResult<THit> = {
  total: number;
  totalHits: number;
  hits: THit[];
};

export async function searchPixabayVideos(
  query: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<{ videos: PixabayVideo[] }> {
  if (!isPixabayConfigured()) return { videos: [] };

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 50),
    safesearch: "true",
  });

  const res = await fetch(PIXABAY_VIDEO_ENDPOINT + "?" + params.toString());
  if (!res.ok) {
    throw new Error("Pixabay API error: " + res.status);
  }

  const data = (await res.json()) as PixabaySearchResult<PixabayVideo>;
  return { videos: data.hits ?? [] };
}

export async function searchPixabayPhotos(
  query: string,
  opts: {
    page?: number;
    perPage?: number;
    orientation?: "vertical" | "horizontal";
  } = {},
): Promise<{ photos: PixabayPhoto[] }> {
  if (!isPixabayConfigured()) return { photos: [] };

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    orientation: opts.orientation ?? "vertical",
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 50),
    safesearch: "true",
  });

  const res = await fetch(PIXABAY_PHOTO_ENDPOINT + "?" + params.toString());
  if (!res.ok) {
    throw new Error("Pixabay API error: " + res.status);
  }

  const data = (await res.json()) as PixabaySearchResult<PixabayPhoto>;
  return { photos: data.hits ?? [] };
}

export function getBestPixabayVideoUrl(video: PixabayVideo): string {
  // Pixabay videos have multiple resolutions. We prefer large or medium.
  return (
    video.videos.large?.url ||
    video.videos.medium?.url ||
    video.videos.small?.url ||
    video.videos.tiny?.url ||
    ""
  );
}
