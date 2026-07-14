export type LanguageCode = "en" | "ar" | "fr" | "ur" | "id";
export type PlatformCode = "youtube" | "tiktok" | "instagram";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "ur", label: "Urdu" },
  { code: "id", label: "Indonesian" },
];

export const PLATFORMS: { code: PlatformCode; label: string }[] = [
  { code: "youtube", label: "YouTube" },
  { code: "tiktok", label: "TikTok" },
  { code: "instagram", label: "Instagram" },
];

export function generateMetadata(
  language: LanguageCode,
  platform: PlatformCode,
  chapterName: string,
  reciterName: string,
  fromAyah: number,
  toAyah: number
): { title: string; description: string; tags: string } {
  const isRange = fromAyah !== toAyah;
  const versesText = isRange ? `${fromAyah}-${toAyah}` : `${fromAyah}`;
  const cleanChapterName = chapterName.replace(/\s+/g, '');
  const cleanReciterName = reciterName.replace(/\s+/g, '');

  let title = "";
  let description = "";
  let tags = "";

  // 1. Generate base content based on language
  switch (language) {
    case "ar":
      title = `تلاوة خاشعة سورة ${chapterName} | ${reciterName}`;
      description = `استمع إلى تلاوة خاشعة ومريحة للقلب من سورة ${chapterName} بصوت القارئ ${reciterName}.\n\nالآيات: ${versesText}\n\nنسأل الله أن يتقبل منا ومنكم صالح الأعمال.`;
      tags = `القرآن, تلاوة, سورة ${chapterName}, ${reciterName}, إسلام, راحة نفسية, خاشعة`;
      break;
    case "fr":
      title = `Magnifique Récitation du Coran | Sourate ${chapterName} - ${reciterName}`;
      description = `Écoutez cette magnifique et apaisante récitation de la Sourate ${chapterName} par le Cheikh ${reciterName}.\n\nVersets: ${versesText}\n\nQu'Allah accepte nos bonnes œuvres.`;
      tags = `Coran, Islam, Sourate ${chapterName}, ${reciterName}, Récitation apaisante, Rappel islamique`;
      break;
    case "ur":
      title = `خوبصورت تلاوت قرآن | سورہ ${chapterName} | ${reciterName}`;
      description = `سورہ ${chapterName} کی دل کو چھو لینے والی اور پرسکون تلاوت قاری ${reciterName} کی آواز میں سنیں۔\n\nآیات: ${versesText}\n\nاللہ ہماری عبادتوں کو قبول فرمائے۔`;
      tags = `قرآن, تلاوت, سورہ ${chapterName}, ${reciterName}, اسلام, اردو`;
      break;
    case "id":
      title = `Lantunan Merdu Al-Quran | Surah ${chapterName} - ${reciterName}`;
      description = `Dengarkan lantunan merdu dan menenangkan hati dari Surah ${chapterName} oleh Syaikh ${reciterName}.\n\nAyat: ${versesText}\n\nSemoga Allah menerima amal ibadah kita.`;
      tags = `AlQuran, Tilawah, Surah ${chapterName}, ${reciterName}, Islam, Murottal, Menenangkan`;
      break;
    case "en":
    default:
      title = `Beautiful Quran Recitation | Surah ${chapterName} - ${reciterName}`;
      description = `Listen to this beautiful and heart-soothing recitation of Surah ${chapterName} by ${reciterName}.\n\nVerses: ${versesText}\n\nMay Allah accept our good deeds.`;
      tags = `Quran, Islam, Surah ${chapterName}, ${reciterName}, Beautiful Recitation, Quranic, Heart soothing`;
      break;
  }

  // 2. Adjust styling based on platform
  const baseHashtags = `#Quran #Islam #Surah${cleanChapterName} #${cleanReciterName}`;
  const tiktokHashtags = `#quran #islam #muslim #quranrecitation #surah${cleanChapterName} #${cleanReciterName} #fyp #foryou #viral #islamic_video #quranvideo`;
  const instaHashtags = `#quran #islam #muslim #quranrecitation #surah${cleanChapterName} #${cleanReciterName} #islamicquotes #quranic #jannah #deen #islamicreminder`;

  if (platform === "tiktok") {
    // TikTok: Short description, heavy on trending hashtags
    return {
      title: `${title} 🕊️🤍`,
      description: `Surah ${chapterName} (${versesText}) 📖✨\n\n${tiktokHashtags}`,
      tags: tiktokHashtags.replace(/#/g, '').replace(/ /g, ','),
    };
  } else if (platform === "instagram") {
    // Instagram: Clean description, emojis, lots of community hashtags
    return {
      title: title, // Insta Reels usually just use caption
      description: `${description}\n\n✨ Tag someone who needs to hear this ✨\n\n.\n.\n.\n${instaHashtags}`,
      tags: instaHashtags.replace(/#/g, '').replace(/ /g, ','),
    };
  } else {
    // YouTube (Default): Detailed description, standard hashtags
    return {
      title: title,
      description: `${description}\n\n${baseHashtags}`,
      tags: tags,
    };
  }
}
