// Reciters mapped to official Quran.com recitation ids.
// The app fetches the full list dynamically (see getRecitations in quran-api);
// this file provides the offline fallback list, Arabic display names and UI helpers.
export type Reciter = {
  id: number; // Quran.com recitation id (verse-by-verse)
  name: string;
  arabic: string;
  style: string;
  accent: string; // gradient class for avatar
  initials: string;
};

export const RECITER_ACCENTS = [
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-yellow-700",
  "from-rose-500 to-pink-700",
  "from-fuchsia-500 to-purple-700",
  "from-cyan-500 to-blue-700",
  "from-orange-500 to-red-700",
  "from-lime-500 to-green-700",
  "from-purple-500 to-indigo-700",
];

// Arabic display names for known Quran.com recitation ids.
// Arabic display names for known Quran.com recitation ids
// and app-only ids (9000+) served from the everyayah.com CDN.
export const ARABIC_NAMES: Record<number, string> = {
  1: "عبد الباسط عبد الصمد",
  2: "عبد الباسط عبد الصمد",
  3: "عبد الرحمن السديس",
  4: "أبو بكر الشاطري",
  5: "هاني الرفاعي",
  6: "محمود خليل الحصري",
  7: "مشاري العفاسي",
  8: "محمد صديق المنشاوي",
  9: "محمد صديق المنشاوي",
  10: "سعود الشريم",
  12: "محمود خليل الحصري",
  9001: "ياسر الدوسري",
  9002: "ناصر القطامي",
  9003: "ماهر المعيقلي",
  9004: "أحمد بن علي العجمي",
  9005: "صلاح البدير",
};

// App-only reciters served via the everyayah.com CDN. These are always
// merged into the reciter list so users can pick them even when the
// Quran.com API doesn't expose them (e.g. Yasser Al-Dossary).
export const EVERYAYAH_RECITERS: Reciter[] = [
  { id: 9001, name: "Yasser Al-Dossary", arabic: "ياسر الدوسري", style: "Murattal", accent: RECITER_ACCENTS[1], initials: "YD" },
  { id: 9003, name: "Maher Al-Muaiqly", arabic: "ماهر المعيقلي", style: "Murattal", accent: RECITER_ACCENTS[2], initials: "MM" },
  { id: 9002, name: "Nasser Al-Qatami", arabic: "ناصر القطامي", style: "Murattal", accent: RECITER_ACCENTS[3], initials: "NQ" },
  { id: 9005, name: "Salah Al-Budair", arabic: "صلاح البدير", style: "Murattal", accent: RECITER_ACCENTS[4], initials: "SB" },
  { id: 9004, name: "Ahmed Al-Ajamy", arabic: "أحمد بن علي العجمي", style: "Murattal", accent: RECITER_ACCENTS[5], initials: "AA" },
];

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// Offline fallback (correct official id mapping).
export const RECITERS: Reciter[] = [
  { id: 7, name: "Mishari Rashid al-Afasy", arabic: ARABIC_NAMES[7], style: "Murattal", accent: RECITER_ACCENTS[0], initials: "MA" },
  { id: 3, name: "Abdur-Rahman as-Sudais", arabic: ARABIC_NAMES[3], style: "Murattal", accent: RECITER_ACCENTS[1], initials: "AS" },
  { id: 4, name: "Abu Bakr al-Shatri", arabic: ARABIC_NAMES[4], style: "Murattal", accent: RECITER_ACCENTS[2], initials: "AS" },
  { id: 1, name: "AbdulBaset AbdulSamad", arabic: ARABIC_NAMES[1], style: "Mujawwad", accent: RECITER_ACCENTS[3], initials: "AA" },
  { id: 2, name: "AbdulBaset AbdulSamad", arabic: ARABIC_NAMES[2], style: "Murattal", accent: RECITER_ACCENTS[4], initials: "AA" },
  { id: 5, name: "Hani ar-Rifai", arabic: ARABIC_NAMES[5], style: "Murattal", accent: RECITER_ACCENTS[5], initials: "HR" },
  { id: 6, name: "Mahmoud Khalil Al-Husary", arabic: ARABIC_NAMES[6], style: "Murattal", accent: RECITER_ACCENTS[6], initials: "MH" },
  { id: 9, name: "Mohamed Siddiq al-Minshawi", arabic: ARABIC_NAMES[9], style: "Murattal", accent: RECITER_ACCENTS[7], initials: "MM" },
  { id: 10, name: "Sa'ud ash-Shuraym", arabic: ARABIC_NAMES[10], style: "Murattal", accent: RECITER_ACCENTS[0], initials: "SS" },
  { id: 12, name: "Al-Husary (Muallim)", arabic: ARABIC_NAMES[12], style: "Muallim", accent: RECITER_ACCENTS[1], initials: "MH" },
];

export const AMBIENT_TRACKS = [
  {
    id: "wind",
    name: "Gentle Wind",
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_1b1e37fed7.mp3",
  },
  {
    id: "rain",
    name: "Soft Rain",
    url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347111d55c.mp3",
  },
  {
    id: "waves",
    name: "Ocean Waves",
    url: "https://cdn.pixabay.com/audio/2022/03/24/audio_d0c6ff1b70.mp3",
  },
];
