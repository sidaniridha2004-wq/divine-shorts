export function buildCaption(
  surahName: string,
  from: number,
  to: number,
  chapterId: number,
  translationSnippet?: string,
): string {
  const ref = from === to ? `${chapterId}:${from}` : `${chapterId}:${from}-${to}`;
  const snippet = translationSnippet
    ? `\n\n"${translationSnippet.replace(/<[^>]*>/g, "").slice(0, 220)}"`
    : "";
  return `Surah ${surahName} (${ref})${snippet}\n\n#Quran #Islam #Reels #QuranReels #Reminder #Deen`;
}
