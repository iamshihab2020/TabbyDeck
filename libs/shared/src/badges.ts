/** Small rewards for how the deck is used. Each can be earned once a day; the PC decides, the decks celebrate. */
export const BADGES = {
  'early-bird': { name: 'Early bird', text: 'You pressed a key before 7 am.' },
  'night-owl': { name: 'Night owl', text: 'You pressed a key after 2 am.' },
  'speed-run': { name: 'Speed run', text: '50 key presses in one minute.' },
  zen: { name: 'Zen', text: 'Do not disturb was on for two hours today.' },
} as const;
export type BadgeId = keyof typeof BADGES;
export const BADGE_IDS = Object.keys(BADGES) as [BadgeId, ...BadgeId[]];
