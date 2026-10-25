import { Icon } from './Icon.tsx';

/** A badge's medal: a round plate in its own colours, with an owl (drawn here; the icon set has none), a bird, a bolt or a lotus. */
export function BadgeArt({ id, size = 56 }: { id: string; size?: number }) {
  if (id === 'night-owl') return (
    <svg class="tb-badge-art" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><radialGradient id="tb-owl-sky" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#3b2f6b" /><stop offset="1" stop-color="#1b1638" /></radialGradient></defs>
      <circle cx="32" cy="32" r="31" fill="url(#tb-owl-sky)" />
      <circle cx="46" cy="16" r="7" fill="#fde68a" /><circle cx="49" cy="14" r="6" fill="#2a2252" />
      <path d="M17 24 L20 12 L26 21z M47 24 L44 12 L38 21z" fill="#8a5a33" />
      <ellipse cx="32" cy="37" rx="16" ry="19" fill="#9c6b3f" />
      <ellipse cx="32" cy="43" rx="10" ry="11" fill="#d9b48a" />
      <path d="M26 41 q2 2 4 0 M34 41 q2 2 4 0 M29 46 q2 2 4 0 M33 46 q2 2 4 0" stroke="#9c6b3f" stroke-width="1.4" fill="none" stroke-linecap="round" />
      <circle cx="25.5" cy="30" r="6.5" fill="#fff8e7" /><circle cx="38.5" cy="30" r="6.5" fill="#fff8e7" />
      <circle cx="25.5" cy="30.5" r="3.6" fill="#1b1638" /><circle cx="38.5" cy="30.5" r="3.6" fill="#1b1638" />
      <circle cx="26.6" cy="29.2" r="1.1" fill="#fff" /><circle cx="39.6" cy="29.2" r="1.1" fill="#fff" />
      <path d="M30 35 h4 l-2 3.4z" fill="#f5a524" />
      <path d="M24 55 h4 M36 55 h4" stroke="#f5a524" stroke-width="2.4" stroke-linecap="round" />
    </svg>
  );
  const plate = id === 'speed-run' ? ['#f5a524', '#7a3e00', 'lightning'] : id === 'early-bird' ? ['#fdba74', '#9a3412', 'bird'] : ['#34d399', '#064e3b', 'flower-lotus'];
  return (
    <span class="tb-badge-art" style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 35%, ${plate[0]}, ${plate[1]})`, color: '#fff' }} aria-hidden="true">
      <Icon name={plate[2]} size={Math.round(size * 0.56)} />
    </span>
  );
}
