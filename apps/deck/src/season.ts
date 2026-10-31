/** What the keys wear for the season: snow all December, pumpkins in the last week of October (as the cat's witch hat). */
export type Season = 'snow' | 'pumpkin' | null;
export function seasonFor(now: Date): Season {
  const m = now.getMonth(), d = now.getDate();
  return m === 11 ? 'snow' : m === 9 && d >= 25 ? 'pumpkin' : null;
}

/** Pumpkins sit on about one key in four, the same ones every time. */
export function hasPumpkin(widgetId: string): boolean {
  let h = 0;
  for (let i = 0; i < widgetId.length; i++) h = (h * 31 + widgetId.charCodeAt(i)) | 0;
  return (h >>> 0) % 4 === 0;
}
