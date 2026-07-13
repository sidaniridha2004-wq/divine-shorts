// Curated reciters mapped to Quran.com recitation ids.
export type Reciter = {
  id: number; // Quran.com recitation id (verse-by-verse)
  chapterId?: number; // chapter_recitations id (used for full-surah audio)
  name: string;
  arabic: string;
  style: string;
  accent: string; // gradient class for avatar
  initials: string;
};

export const RECITERS: Reciter[] = [
  {
    id: 7,
    chapterId: 7,
    name: "Mishary Al-Afasy",
    arabic: "مشاري العفاسي",
    style: "Murattal",
    accent: "from-emerald-500 to-teal-700",
    initials: "MA",
  },
  {
    id: 3,
    chapterId: 3,
    name: "Abdul Rahman Al-Sudais",
    arabic: "عبد الرحمن السديس",
    style: "Murattal",
    accent: "from-amber-500 to-yellow-700",
    initials: "AS",
  },
  {
    id: 4,
    chapterId: 4,
    name: "Saad Al-Ghamdi",
    arabic: "سعد الغامدي",
    style: "Murattal",
    accent: "from-rose-500 to-pink-700",
    initials: "SG",
  },
  {
    id: 2,
    chapterId: 2,
    name: "AbdulBaset AbdulSamad",
    arabic: "عبد الباسط عبد الصمد",
    style: "Mujawwad",
    accent: "from-fuchsia-500 to-purple-700",
    initials: "AB",
  },
  {
    id: 1,
    chapterId: 1,
    name: "AbdulBaset AbdulSamad",
    arabic: "عبد الباسط عبد الصمد",
    style: "Murattal",
    accent: "from-purple-500 to-indigo-700",
    initials: "AB",
  },
  {
    id: 6,
    chapterId: 6,
    name: "Maher Al-Muaiqly",
    arabic: "ماهر المعيقلي",
    style: "Murattal",
    accent: "from-cyan-500 to-blue-700",
    initials: "MM",
  },
  {
    id: 5,
    chapterId: 5,
    name: "Hani Ar-Rifai",
    arabic: "هاني الرفاعي",
    style: "Murattal",
    accent: "from-orange-500 to-red-700",
    initials: "HR",
  },
  {
    id: 9,
    chapterId: 9,
    name: "Mahmoud Khalil Al-Husary",
    arabic: "محمود خليل الحصري",
    style: "Murattal",
    accent: "from-lime-500 to-green-700",
    initials: "MH",
  },
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
