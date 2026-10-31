import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DeckView, WidgetView } from '@tabbydeck/shared';
import { BACKGROUNDS } from '@tabbydeck/shared/backgrounds';
import { Icon, ICON_NAMES, Tile } from '@tabbydeck/ui';
import { MAX_DATA_URL, clampOffset, coverScale, encodeCrop, loadImage, outSize, readFile, sourceRect, type Size } from '../photo.ts';

/** What a key editor saves: only the fields that changed. image null takes the picture off. */
export interface KeyPatch { label?: string; icon?: string | null; bg?: string; image?: string | null; minutes?: number; focus?: number; rest?: number }

/** A minutes field's text as whole minutes within its range, or undefined while it is not a number. */
const mins = (v: string, max: number) => { const n = Math.round(Number(v)); return v.trim() && n >= 1 ? Math.min(max, n) : undefined; };

const SWATCHES = ['#25221f', '#3b1d1d', '#3b2a12', '#1f3320', '#123040', '#1d2547', '#2b2440', '#3d1f3a', '#5c2a1a', '#e59a43'];
const KEY_PX = 512, BG_PX = 1600;

/** A picture chosen on the phone: a GIF goes as it is (so it still moves), anything else is cropped first. */
function usePicture(onReady: (dataUrl: string) => void, onError: (text: string) => void) {
  const [crop, setCrop] = useState<string | null>(null);
  const take = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await readFile(file);
      if (file.type === 'image/gif') { if (url.length > MAX_DATA_URL) onError('That GIF is too big. Choose one under 1 MB.'); else onReady(url); return; }
      setCrop(url);
    } catch { onError('Could not read that picture'); }
  };
  return { crop, take, done: () => setCrop(null) };
}

/** Two buttons: choose from the gallery, or take a photo now. */
function PhotoButtons({ onFile }: { onFile(f: File | undefined): void }) {
  const pick = (e: Event) => { const i = e.target as HTMLInputElement; onFile(i.files?.[0]); i.value = ''; };
  return (
    <>
      <label class="btn"><Icon name="images" size={18} />Gallery<input type="file" accept="image/*" hidden onChange={pick} /></label>
      <label class="btn"><Icon name="camera" size={18} />Camera<input type="file" accept="image/*" capture="environment" hidden onChange={pick} /></label>
    </>
  );
}

/** Change one key from the phone: its label, icon, colour and picture, or delete it. */
export function KeyEditor({ w, aspect, assetUrl, onSave, onDelete, onClose }: { w: WidgetView; aspect: number; assetUrl(id: string): string; onSave(p: KeyPatch): void; onDelete(): void; onClose(): void }) {
  const [label, setLabel] = useState(w.look.label ?? '');
  const [icon, setIcon] = useState<string | null>(w.look.icon ?? null);
  const [bg, setBg] = useState(w.look.bg);
  const [image, setImage] = useState<string | null | undefined>(undefined); // undefined: as it was
  const [icons, setIcons] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const [times, setTimes] = useState({ minutes: String(w.timer?.minutes ?? ''), focus: String(w.timer?.focus ?? ''), rest: String(w.timer?.rest ?? '') });
  const pic = usePicture(url => { setImage(url); setError(''); }, setError);
  const opened = useMemo(() => Date.now(), [w.id]);
  const shownImage = image === undefined ? w.look.image : image ?? undefined;
  const preview: WidgetView = { ...w, look: { ...w.look, label: label || undefined, icon: icon ?? undefined, bg, image: shownImage, ...(image !== undefined ? { imageFit: undefined } : {}) } };
  const found = useMemo(() => { const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean); return ICON_NAMES.filter(n => words.every(x => n.includes(x))).slice(0, 120); }, [q]);
  const save = () => {
    const p: KeyPatch = {};
    if (label !== (w.look.label ?? '')) p.label = label;
    if (icon !== (w.look.icon ?? null)) p.icon = icon;
    if (bg !== w.look.bg) p.bg = bg;
    if (image !== undefined) p.image = image;
    for (const [k, max] of [['minutes', 600], ['focus', 180], ['rest', 60]] as const) {
      const n = mins(times[k], max);
      if (w.timer?.[k] !== undefined && n !== undefined && n !== w.timer[k]) p[k] = n;
    }
    if (Object.keys(p).length) onSave(p); else onClose();
  };
  if (pic.crop) return <Cropper src={pic.crop} aspect={aspect} max={KEY_PX} onDone={url => { pic.done(); if (url) setImage(url); else setError('That picture is too big to send'); }} onCancel={pic.done} />;
  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet edit-sheet" role="dialog" aria-label="Edit key" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <div class="edit-top">
          <span class="edit-preview tb-grid" style={{ width: `${Math.round(72 * Math.min(1.6, aspect))}px`, height: '72px' }}>
            <Tile widget={preview} cell={{ w: (72 * Math.min(1.6, aspect)) / w.w, h: 72 / w.h }} assetUrl={id => (id.startsWith('data:') ? id : assetUrl(id))} tabIndex={-1} style={{ left: '0', top: '0', width: '100%', height: '100%' }} />
          </span>
          <input class="input" value={label} maxLength={40} placeholder="Label" aria-label="Label" onInput={e => setLabel((e.target as HTMLInputElement).value)} />
        </div>
        {w.timer && <>
          <h2 class="sheet-h">{w.timer.minutes !== undefined ? 'Timer' : 'Focus and break'}</h2>
          <div class="sheet-row start">
            {([['minutes', 'Minutes', 600], ['focus', 'Focus minutes', 180], ['rest', 'Break minutes', 60]] as const).filter(([k]) => w.timer![k] !== undefined).map(([k, name, max]) => (
              <label key={k} class="edit-minutes">{name}
                <input class="input" type="number" inputMode="numeric" min={1} max={max} value={times[k]} onInput={e => setTimes(t => ({ ...t, [k]: (e.target as HTMLInputElement).value }))} />
              </label>
            ))}
          </div>
        </>}
        <h2 class="sheet-h">Colour</h2>
        <div class="swatches" role="radiogroup" aria-label="Key colour">
          {SWATCHES.map(c => <button key={c} type="button" role="radio" aria-checked={bg === c} aria-label={c} class={bg === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => setBg(c)} />)}
        </div>
        <h2 class="sheet-h">Icon</h2>
        <div class="sheet-row start">
          <button type="button" class="btn" aria-expanded={icons} onClick={() => setIcons(v => !v)}>{icon ? <Icon name={icon} size={18} /> : null}{icons ? 'Close icons' : 'Choose icon'}</button>
          {icon && <button type="button" class="btn" onClick={() => setIcon(null)}>No icon</button>}
        </div>
        {icons && <>
          <input class="input" type="search" placeholder="Search icons" aria-label="Search icons" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} />
          <div class="edit-icons" role="listbox" aria-label="Icons">
            {found.map(n => <button key={n} type="button" role="option" aria-selected={n === icon} class={n === icon ? 'edit-icon on' : 'edit-icon'} aria-label={n.replace(/-/g, ' ')} onClick={() => { setIcon(n); setIcons(false); }}><Icon name={n} size={22} /></button>)}
            {!found.length && <p class="hint">No icons match.</p>}
          </div>
        </>}
        <h2 class="sheet-h">Picture</h2>
        <div class="sheet-row start">
          <PhotoButtons onFile={f => void pic.take(f)} />
          {shownImage && <button type="button" class="btn" onClick={() => setImage(null)}>Remove</button>}
        </div>
        {error && <p class="hint edit-error" role="alert">{error}</p>}
        <div class="sheet-row">
          <button type="button" class={sure ? 'btn danger' : 'btn'} onClick={() => (sure ? onDelete() : setSure(true))}><Icon name="trash" size={18} />{sure ? 'Tap again to delete' : 'Delete'}</button>
          <span class="grow" />
          <button type="button" class="btn" onClick={onClose}>Cancel</button>
          <button type="button" class="btn primary" onClick={save}>Save</button>
        </div>
      </section>
    </div>
  );
}

/** The profile's background, from the phone: a ready-made colour or gradient, or a photo. */
export function BackgroundPicker({ view, onPick, onPhoto, onRemovePhoto, onClose }: { view: DeckView; onPick(bg: string): void; onPhoto(dataUrl: string): void; onRemovePhoto(): void; onClose(): void }) {
  const [error, setError] = useState('');
  const pic = usePicture(onPhoto, setError);
  if (pic.crop) return <Cropper src={pic.crop} aspect={innerWidth / innerHeight} max={BG_PX} onDone={url => { pic.done(); if (url) onPhoto(url); else setError('That picture is too big to send'); }} onCancel={pic.done} />;
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet" role="dialog" aria-label="Background" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <h2 class="sheet-h">Background for {view.profileName}</h2>
        <div class="bg-choices" role="radiogroup" aria-label="Background">
          {BACKGROUNDS.map(b => <button key={b.name} type="button" role="radio" aria-checked={!view.bgImage && view.bg === b.bg} class={!view.bgImage && view.bg === b.bg ? 'bg-choice on' : 'bg-choice'} style={{ background: b.bg }} onClick={() => onPick(b.bg)}><span>{b.name}</span></button>)}
        </div>
        <h2 class="sheet-h">Photo</h2>
        <div class="sheet-row start">
          <PhotoButtons onFile={f => void pic.take(f)} />
          {view.bgImage && <button type="button" class="btn" onClick={onRemovePhoto}>Remove photo</button>}
        </div>
        {error && <p class="hint edit-error" role="alert">{error}</p>}
        <p class="hint">Glass keys show the background through them. Choose the key style in TabbyDeck on your PC, under Customize.</p>
        <div class="sheet-row"><button type="button" class="btn primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

/** Drag to place the picture in the frame and zoom with the slider; the frame has the key's (or the screen's) shape. */
export function Cropper({ src, aspect, max, onDone, onCancel }: { src: string; aspect: number; max: number; onDone(dataUrl: string | null): void; onCancel(): void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const room = { w: Math.min(innerWidth - 48, 360), h: innerHeight * 0.5 };
  const frame: Size = room.w / aspect <= room.h ? { w: room.w, h: room.w / aspect } : { w: room.h * aspect, h: room.h };
  const size = img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 };
  const scale = coverScale(size, frame, zoom);
  useEffect(() => void loadImage(src).then(i => {
    setImg(i);
    const s = coverScale({ w: i.naturalWidth, h: i.naturalHeight }, frame, 1);
    setOff({ x: (frame.w - i.naturalWidth * s) / 2, y: (frame.h - i.naturalHeight * s) / 2 }); // start centred
  }, () => onDone(null)), [src]);
  const rezoom = (z: number) => {
    const next = coverScale(size, frame, z), k = next / scale, cx = frame.w / 2, cy = frame.h / 2;
    setOff(clampOffset(cx - (cx - off.x) * k, cy - (cy - off.y) * k, size, next, frame)); setZoom(z);
  };
  const finish = () => { if (!img) return; const r = sourceRect(off, scale, frame); onDone(encodeCrop(img, r, outSize(r, max))); };
  return (
    <div class="sheet-backdrop crop-backdrop">
      <section class="sheet crop-sheet" role="dialog" aria-label="Crop the picture">
        <h2 class="sheet-h">Drag to place it</h2>
        <div class="crop-frame" style={{ width: `${frame.w}px`, height: `${frame.h}px` }}
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={e => { const d = drag.current; if (d) setOff(clampOffset(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y, size, scale, frame)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {img && <img src={src} alt="" draggable={false} style={{ width: `${size.w * scale}px`, height: `${size.h * scale}px`, transform: `translate(${off.x}px, ${off.y}px)` }} />}
        </div>
        <label class="crop-zoom"><Icon name="magnifying-glass" size={18} /><input type="range" min="1" max="3" step="0.01" value={zoom} aria-label="Zoom" onInput={e => rezoom(Number((e.target as HTMLInputElement).value))} /></label>
        <div class="sheet-row">
          <button type="button" class="btn" onClick={onCancel}>Cancel</button>
          <button type="button" class="btn primary" disabled={!img} onClick={finish}>Use it</button>
        </div>
      </section>
    </div>
  );
}
