// Quran.com API v4 client with localStorage caching.
const BASE = "https://api.quran.com/api/v4";

export type Chapter = {
  id: number;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
  revelation_place: string;
};

export type Verse = {
  id: number;
  verse_key: string; // "2:255"
  verse_number: number;
  text_uthmani: string;
  words?: { text_uthmani: string; audio_url?: string | null }[];
  translations?: { resource_id: number; text: string }[];
};

export type TranslationResource = {
  id: number;
  name: string;
  language_name: string;
  author_name: string;
};

const cache = new Map<string, unknown>();

async function fetchJson<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const lsKey = `quranreels:api:${path}`;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(lsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        cache.set(path, parsed);
        return parsed as T;
      }
    } catch {}
  }
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Quran API ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(lsKey, JSON.stringify(data));
    } catch {}
  }
  return data as T;
}

export async function getChapters(): Promise<Chapter[]> {
  const data = await fetchJson<{ chapters: Chapter[] }>("/chapters?language=en");
  return data.chapters;
}

export async function getVersesByChapter(
  chapterId: number,
  opts: { translationIds?: number[]; words?: boolean } = {},
): Promise<Verse[]> {
  const params = new URLSearchParams();
  params.set("per_page", "300");
  params.set("fields", "text_uthmani");
  if (opts.words) params.set("words", "true");
  if (opts.translationIds?.length)
    params.set("translations", opts.translationIds.join(","));
  const data = await fetchJson<{ verses: Verse[] }>(
    `/verses/by_chapter/${chapterId}?${params}`,
  );
  return data.verses;
}

export type RecitationInfo = { id: number; reciter_name: string; style: string };

// Audio URLs for a chapter from a given recitation id
export async function getChapterAudio(
  recitationId: number,
  chapterId: number,
): Promise<string | null> {
  try {
    const data = await fetchJson<{ audio_file: { audio_url: string } }>(
      `/chapter_recitations/${recitationId}/${chapterId}`,
    );
    return data.audio_file?.audio_url ?? null;
  } catch {
    return null;
  }
}

// Per-ayah audio (with timing) from verse recitations
export async function getAyahAudioSegments(
  recitationId: number,
  chapterId: number,
): Promise<{ verse_key: string; url: string; duration?: number }[]> {
  try {
    const data = await fetchJson<{
      audio_files: { verse_key: string; url: string; duration?: number }[];
    }>(`/recitations/${recitationId}/by_chapter/${chapterId}`);
    return data.audio_files.map((a) => ({
      ...a,
      url: a.url.startsWith("http") ? a.url : `https://verses.quran.com/${a.url}`,
    }));
  } catch {
    return [];
  }
}

export type RecitationResource = {
  id: number;
  reciter_name: string;
  style: string | null;
  translated_name?: { name: string; language_name?: string };
};

// Full list of available recitations (reciters) from Quran.com
export async function getRecitations(): Promise<RecitationResource[]> {
  try {
    const data = await fetchJson<{ recitations: RecitationResource[] }>(
      "/resources/recitations?language=en",
    );
    return data.recitations ?? [];
  } catch {
    return [];
  }
}

export async function searchVerses(query: string): Promise<
  { verse_key: string; text: string; translation: string }[]
> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({ q: query, size: "20", language: "en" });
    const data = await fetchJson<{
      search: {
        results: {
          verse_key: string;
          text: string;
          translations: { text: string }[];
        }[];
      };
    }>(`/search?${params}`);
    return data.search.results.map((r) => ({
      verse_key: r.verse_key,
      text: r.text,
      translation: r.translations?.[0]?.text ?? "",
    }));
  } catch {
    return [];
  }
}
