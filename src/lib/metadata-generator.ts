export type LanguageCode = "en" | "ar" | "fr" | "ur" | "id";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "ur", label: "Urdu" },
  { code: "id", label: "Indonesian" },
];

export function generateMetadata(
  language: LanguageCode,
  chapterName: string,
  reciterName: string,
  fromAyah: number,
  toAyah: number
): { title: string; description: string; tags: string } {
  const isRange = fromAyah !== toAyah;
  const versesText = isRange ? `${fromAyah}-${toAyah}` : `${fromAyah}`;

  switch (language) {
    case "ar":
      return {
        title: `تلاوة خاشعة سورة ${chapterName} | ${reciterName}`,
        description: `استمع إلى تلاوة خاشعة ومريحة للقلب من سورة ${chapterName} بصوت القارئ ${reciterName}.\n\nالآيات: ${versesText}\n\nنسأل الله أن يتقبل منا ومنكم صالح الأعمال.\n\n#القرآن #القرآن_الكريم #تلاوة #سورة_${chapterName.replace(/\s+/g, '_')} #${reciterName.replace(/\s+/g, '_')}`,
        tags: `القرآن, تلاوة, سورة ${chapterName}, ${reciterName}, إسلام, راحة نفسية, خاشعة`,
      };
    case "fr":
      return {
        title: `Magnifique Récitation du Coran | Sourate ${chapterName} - ${reciterName}`,
        description: `Écoutez cette magnifique et apaisante récitation de la Sourate ${chapterName} par le Cheikh ${reciterName}.\n\nVersets: ${versesText}\n\nQu'Allah accepte nos bonnes œuvres.\n\n#Coran #Islam #Sourate${chapterName.replace(/\s+/g, '')} #${reciterName.replace(/\s+/g, '')}`,
        tags: `Coran, Islam, Sourate ${chapterName}, ${reciterName}, Récitation apaisante, Rappel islamique`,
      };
    case "ur":
      return {
        title: `خوبصورت تلاوت قرآن | سورہ ${chapterName} | ${reciterName}`,
        description: `سورہ ${chapterName} کی دل کو چھو لینے والی اور پرسکون تلاوت قاری ${reciterName} کی آواز میں سنیں۔\n\nآیات: ${versesText}\n\nاللہ ہماری عبادتوں کو قبول فرمائے۔\n\n#قرآن #اسلام #سورہ_${chapterName.replace(/\s+/g, '_')} #${reciterName.replace(/\s+/g, '_')}`,
        tags: `قرآن, تلاوت, سورہ ${chapterName}, ${reciterName}, اسلام, اردو`,
      };
    case "id":
      return {
        title: `Lantunan Merdu Al-Quran | Surah ${chapterName} - ${reciterName}`,
        description: `Dengarkan lantunan merdu dan menenangkan hati dari Surah ${chapterName} oleh Syaikh ${reciterName}.\n\nAyat: ${versesText}\n\nSemoga Allah menerima amal ibadah kita.\n\n#AlQuran #Islam #Surah${chapterName.replace(/\s+/g, '')} #${reciterName.replace(/\s+/g, '')}`,
        tags: `Al-Quran, Tilawah, Surah ${chapterName}, ${reciterName}, Islam, Murottal, Menenangkan`,
      };
    case "en":
    default:
      return {
        title: `Beautiful Quran Recitation | Surah ${chapterName} - ${reciterName}`,
        description: `Listen to this beautiful and heart-soothing recitation of Surah ${chapterName} by ${reciterName}.\n\nVerses: ${versesText}\n\nMay Allah accept our good deeds.\n\n#Quran #Islam #Surah${chapterName.replace(/\s+/g, '')} #${reciterName.replace(/\s+/g, '')}`,
        tags: `Quran, Islam, Surah ${chapterName}, ${reciterName}, Beautiful Recitation, Quranic, Heart soothing`,
      };
  }
}
