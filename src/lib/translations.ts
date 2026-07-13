// Curated translation resources (Quran.com resource IDs).
export type TranslationOption = {
  id: number;
  label: string;
  language: string;
};

export const TRANSLATIONS: TranslationOption[] = [
  { id: 20, label: "Saheeh International (EN)", language: "English" },
  { id: 22, label: "Yusuf Ali (EN)", language: "English" },
  { id: 19, label: "Pickthall (EN)", language: "English" },
  { id: 31, label: "Hamidullah (FR)", language: "French" },
  { id: 234, label: "Abul A'la Maududi (UR)", language: "Urdu" },
  { id: 33, label: "The Indonesian Ministry of Religious Affairs (ID)", language: "Indonesian" },
  { id: 77, label: "Diyanet İşleri (TR)", language: "Turkish" },
  { id: 83, label: "Sheikh Isa Garcia (ES)", language: "Spanish" },
  { id: 27, label: "Bubenheim & Elyas (DE)", language: "German" },
];

export const ARABIC_FONTS = [
  { id: "amiri", label: "Amiri", css: "'Amiri', serif" },
  { id: "scheherazade", label: "Scheherazade New", css: "'Scheherazade New', serif" },
  { id: "noto", label: "Noto Naskh Arabic", css: "'Noto Naskh Arabic', serif" },
  { id: "lateef", label: "Lateef", css: "'Lateef', serif" },
  { id: "kfgqpc", label: "KFGQPC Uthmani", css: "'KFGQPC Uthmanic Script HAFS', 'Amiri', serif" },
];
