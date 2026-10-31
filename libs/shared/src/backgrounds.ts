/** Ready-made deck backgrounds: plain colours and gradients. Phones may set only these or a plain #rrggbb colour. */
export const BACKGROUNDS: { name: string; bg: string }[] = [
  { name: 'Night', bg: '#121110' },
  { name: 'Ink', bg: '#0f1420' },
  { name: 'Forest', bg: '#0f1a14' },
  { name: 'Plum', bg: '#1a1020' },
  { name: 'Sunset', bg: 'linear-gradient(160deg, #3a1c2e 0%, #6b2f1f 55%, #a8562a 100%)' },
  { name: 'Ocean', bg: 'linear-gradient(160deg, #0b1d33 0%, #123d5c 55%, #1f6f8b 100%)' },
  { name: 'Aurora', bg: 'linear-gradient(160deg, #0d1b2a 0%, #1b4332 50%, #5a2a83 100%)' },
  { name: 'Ember', bg: 'linear-gradient(160deg, #1a0f0a 0%, #4a1c10 60%, #7a2e12 100%)' },
  { name: 'Lilac', bg: 'linear-gradient(160deg, #1e1530 0%, #3d2b63 55%, #7c5cff 100%)' },
  { name: 'Slate', bg: 'linear-gradient(180deg, #23262b 0%, #121315 100%)' },
];

/** A background a phone may set: one of the ready-made ones, or a plain colour. */
export const isBackground = (bg: string) => /^#[0-9a-f]{6}$/i.test(bg) || BACKGROUNDS.some(b => b.bg === bg);
