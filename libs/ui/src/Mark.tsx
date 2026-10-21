/** The TabbyDeck mark: four dark keys on an amber cap (the tray icon draws the same shape). */
export function Mark({ size = 20, class: cls }: { size?: number; class?: string }) {
  return (
    <svg class={cls ? `tb-mark ${cls}` : 'tb-mark'} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="6" fill="var(--accent)" />
      <rect x="4.6" y="4.6" width="4.6" height="4.6" rx="1.2" fill="#1a1208" />
      <rect x="10.8" y="4.6" width="4.6" height="4.6" rx="1.2" fill="#1a1208" />
      <rect x="4.6" y="10.8" width="4.6" height="4.6" rx="1.2" fill="#1a1208" />
      <rect x="10.8" y="10.8" width="4.6" height="4.6" rx="1.2" fill="#1a1208" opacity="0.45" />
    </svg>
  );
}
