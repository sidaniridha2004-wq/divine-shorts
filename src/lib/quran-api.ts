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

async function fetchJson<T>(path: string, base: string = BASE): Promise<T> {
  const fullUrl = path.startsWith("http") ? path : `${base}${path}`;
  if (cache.has(fullUrl)) return cache.get(fullUrl) as T;
  const lsKey = `quranreels:api:${fullUrl}`;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(lsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        cache.set(fullUrl, parsed);
        return parsed as T;
      }
    } catch {}
  }
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  cache.set(fullUrl, data);
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

// Every-Ayah CDN folders — used both as a fallback when Quran.com returns
// no verse-by-verse audio, AND to expose reciters (like Yasser Al-Dossary)
// that are otherwise unavailable via the Quran.com API.
export const EVERYAYAH_FOLDERS: Record<number, string> = {
  // App-only reciters (not in Quran.com list)
  9001: "Yasser_Ad-Dussary_128kbps",
  9002: "Nasser_Alqatami_128kbps",
  9003: "Maher_AlMuaiqly_64kbps",
  9004: "Ahmed_ibn_Ali_al-Ajamy_128kbps",
  9005: "Salah_AlBudair_128kbps",
  9006: "Ghamadi_40kbps",
  9007: "Muhammad_Jibreel_128kbps",
  9008: "Muhammad_Ayyoub_128kbps",
  9009: "Abdullah_Basfar_192kbps",
  9010: "Khalifa_Taniji_64kbps",
  9011: "Fares_Abbad_64kbps",
  9012: "Ali_Jaber_64kbps",
  9013: "Mohammad_al_Tablaway_128kbps",
  // Known Quran.com reciter ids → matching everyayah folder (fallback)
  1: "Abdul_Basit_Mujawwad_128kbps",
  2: "Abdul_Basit_Murattal_192kbps",
  3: "Abdurrahmaan_As-Sudais_192kbps",
  4: "Abu_Bakr_Ash-Shaatree_128kbps",
  5: "Hani_Rifai_192kbps",
  6: "Husary_128kbps",
  7: "Alafasy_128kbps",
  8: "Minshawy_Mujawwad_192kbps",
  9: "Minshawy_Murattal_128kbps",
  10: "Saood_ash-Shuraym_128kbps",
  12: "Husary_Muallim_128kbps",
};

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

async function everyayahSegments(
  folder: string,
  chapterId: number,
): Promise<{ verse_key: string; url: string; duration?: number }[]> {
  const chapters = await getChapters().catch(() => [] as Chapter[]);
  const ch = chapters.find((c) => c.id === chapterId);
  const count = ch?.verses_count ?? 7;
  return Array.from({ length: count }, (_, i) => {
    const v = i + 1;
    return {
      verse_key: `${chapterId}:${v}`,
      url: `https://everyayah.com/data/${folder}/${pad3(chapterId)}${pad3(v)}.mp3`,
    };
  });
}

// Per-ayah audio (with timing) from verse recitations
export async function getAyahAudioSegments(
  recitationId: number,
  chapterId: number,
): Promise<{ verse_key: string; url: string; duration?: number }[]> {
  const folder = EVERYAYAH_FOLDERS[recitationId];
  // App-only ids (>=9000) skip Quran.com entirely.
  if (folder && recitationId >= 9000) return everyayahSegments(folder, chapterId);
  try {
    const data = await fetchJson<{
      audio_files: { verse_key: string; url: string; duration?: number }[];
    }>(`/recitations/${recitationId}/by_chapter/${chapterId}`);
    const files = data.audio_files ?? [];
    if (files.length) {
      return files.map((a) => ({
        ...a,
        url: a.url.startsWith("http") ? a.url : `https://verses.quran.com/${a.url}`,
      }));
    }
  } catch {}
  // Fallback to everyayah if we know a matching folder for this reciter.
  if (folder) return everyayahSegments(folder, chapterId);
  return [];
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

// ─────────────────────────────────────────────────────────────────────────────
// mp3quran.net API Integration (Gapless Audio)
// ─────────────────────────────────────────────────────────────────────────────

export type Mp3QuranReciter = {
  id: number;
  name: string;
  rewaya: string;
  folder_url: string;
  soar_count: number;
  soar_link: string;
};

// Known popular reciter IDs on mp3quran to boost to the top
const POPULAR_MP3QURAN_IDS = [
  123, // Mishary Alafasy
  54,  // Abdur-Rahman As-Sudais
  118, // Mahmoud Khalil Al-Husary
  53,  // AbdulBaset AbdulSamad
  112, // Mohamed Siddiq al-Minshawi
  92,  // Yasser Al-Dossary
  133, // Maher Al-Muaiqly
  30,  // Saad Al-Ghamdi
  5,   // Ahmed Al-Ajamy
  20,  // Khalid Al-Jalil
  81,  // Fares Abbad
  86,  // Nasser Al-Qatami
];

export async function getMp3QuranReciters(): Promise<Mp3QuranReciter[]> {
  try {
    const data = await fetchJson<Mp3QuranReciter[]>("/ayat_timing/reads", "https://www.mp3quran.net/api/v3");
    // Sort so that popular ones are at the top
    return data.sort((a, b) => {
      const aIndex = POPULAR_MP3QURAN_IDS.indexOf(a.id);
      const bIndex = POPULAR_MP3QURAN_IDS.indexOf(b.id);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name, "ar");
    });
  } catch {
    return [];
  }
}

export type AyahTiming = {
  ayah: number;
  start_time: number;
  end_time: number;
};

export async function getAyahTimings(surahId: number, readId: number): Promise<AyahTiming[]> {
  try {
    const data = await fetchJson<AyahTiming[]>(`/ayat_timing?surah=${surahId}&read=${readId}`, "https://www.mp3quran.net/api/v3");
    return data;
  } catch {
    return [];
  }
}

