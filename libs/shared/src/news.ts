/** The newest release in CHANGELOG.md: its version and, per "### " heading, the "- " lines under it. */
export interface News { version: string; sections: { title: string; items: string[] }[] }

export function latestNews(changelog: string): News | null {
  const top = changelog.split(/^## /m)[1];
  if (!top) return null;
  const [head, ...parts] = top.split(/^### /m);
  const version = head.trim().split(/\s/)[0];
  const sections = parts.map(p => {
    const [title, ...lines] = p.split('\n');
    return { title: title.trim(), items: lines.filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()) };
  }).filter(s => s.items.length);
  return version ? { version, sections } : null;
}

/** "Customize: a new page…" -> "a new page…" under the label "Customize"; lines without a label stay as they are. */
export function splitLabel(item: string): { label: string | null; text: string } {
  const m = /^([A-Z][\w /'-]{1,30}): (.+)$/.exec(item);
  return m ? { label: m[1], text: m[2].charAt(0).toUpperCase() + m[2].slice(1) } : { label: null, text: item };
}
