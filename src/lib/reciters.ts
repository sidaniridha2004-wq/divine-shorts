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
  9006: "سعد الغامدي",
  9007: "محمد جبريل",
  9008: "محمد أيوب",
  9009: "عبد الله بصفر",
  9010: "خليفة الطنيجي",
  9011: "فارس عباد",
  9012: "علي جابر",
  9013: "محمد الطبلاوي",
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
  { id: 9006, name: "Saad Al-Ghamdi", arabic: "سعد الغامدي", style: "Murattal", accent: RECITER_ACCENTS[6], initials: "SG" },
  { id: 9007, name: "Muhammad Jibreel", arabic: "محمد جبريل", style: "Murattal", accent: RECITER_ACCENTS[7], initials: "MJ" },
  { id: 9008, name: "Muhammad Ayyoub", arabic: "محمد أيوب", style: "Murattal", accent: RECITER_ACCENTS[0], initials: "MA" },
  { id: 9009, name: "Abdullah Basfar", arabic: "عبد الله بصفر", style: "Murattal", accent: RECITER_ACCENTS[1], initials: "AB" },
  { id: 9010, name: "Khalifa Al-Tunaiji", arabic: "خليفة الطنيجي", style: "Murattal", accent: RECITER_ACCENTS[2], initials: "KT" },
  { id: 9011, name: "Fares Abbad", arabic: "فارس عباد", style: "Murattal", accent: RECITER_ACCENTS[3], initials: "FA" },
  { id: 9012, name: "Ali Jaber", arabic: "علي جابر", style: "Murattal", accent: RECITER_ACCENTS[4], initials: "AJ" },
  { id: 9013, name: "Muhammad Al-Tablawi", arabic: "محمد الطبلاوي", style: "Murattal", accent: RECITER_ACCENTS[5], initials: "MT" },
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
