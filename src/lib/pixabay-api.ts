// Pixabay API client for fetching video and photo backgrounds dynamically.

export type PixabayVideo = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  picture_id: string;
  videos: {
    large?: { url: string; width: number; height: number; size: number };
    medium?: { url: string; width: number; height: number; size: number };
    small?: { url: string; width: number; height: number; size: number };
    tiny?: { url: string; width: number; height: number; size: number };
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

export type PixabaySearchResult = {
  total: number;
  totalHits: number;
  hits: any[];
};

export async function searchPixabayVideos(
  query: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<{ videos: PixabayVideo[] }> {
  const apiKey = import.meta.env.VITE_PIXABAY_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_PIXABAY_API_KEY is not set in .env");
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 50),
    safesearch: "true",
  });

  const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
  if (!res.ok) {
    throw new Error(`Pixabay API error: ${res.statusText}`);
  }

  const data = await res.json() as PixabaySearchResult;
  return { videos: data.hits as PixabayVideo[] };
}

export async function searchPixabayPhotos(
  query: string,
  opts: { page?: number; perPage?: number; orientation?: "vertical" | "horizontal" } = {},
): Promise<{ photos: PixabayPhoto[] }> {
  const apiKey = import.meta.env.VITE_PIXABAY_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_PIXABAY_API_KEY is not set in .env");
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    orientation: opts.orientation ?? "vertical",
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 50),
    safesearch: "true",
  });

  const res = await fetch(`https://pixabay.com/api/?${params}`);
  if (!res.ok) {
    throw new Error(`Pixabay API error: ${res.statusText}`);
  }

  const data = await res.json() as PixabaySearchResult;
  return { photos: data.hits as PixabayPhoto[] };
}

export function getBestPixabayVideoUrl(video: PixabayVideo): string {
  // Pixabay videos have multiple resolutions. We prefer large or medium.
  if (video.videos.large && video.videos.large.url) return video.videos.large.url;
  if (video.videos.medium && video.videos.medium.url) return video.videos.medium.url;
  if (video.videos.small && video.videos.small.url) return video.videos.small.url;
  if (video.videos.tiny && video.videos.tiny.url) return video.videos.tiny.url;
  return "";
}
