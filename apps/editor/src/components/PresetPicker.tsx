import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_LOOK, type Widget } from '@tabbydeck/shared';
import { newId } from '@tabbydeck/shared/ids';
import { PRESETS, type Preset } from '@tabbydeck/shared/presets';
import { Icon, tileStyle } from '@tabbydeck/ui';
import { Modal } from './Modal.tsx';
import { useApi } from '../state.ts';

/** The widget a preset adds at (x, y): its look, and its steps on Press. */
export function presetWidget(p: Preset, x: number, y: number): Omit<Widget, 'id' | 'folderId'> {
  return {
    x, y, w: 1, h: 1,
    look: { ...DEFAULT_LOOK, label: p.label, icon: p.icon, bg: p.bg, fg: p.fg ?? DEFAULT_LOOK.fg },
    config: { kind: 'button', policy: 'ignore', triggers: { press: p.steps.map(s => ({ id: newId(), action: s.action, params: s.params ?? {} })) } },
  };
}

export interface App { id: string; name: string }
export type PresetChoice = Preset | 'blank' | 'folder' | { app: App };

/** A button that opens an installed app; image is the uploaded copy of its icon, when it has one. */
export function appWidget(app: App, image: string | undefined, x: number, y: number): Omit<Widget, 'id' | 'folderId'> {
  return {
    x, y, w: 1, h: 1,
    look: { ...DEFAULT_LOOK, label: app.name, ...(image ? { image, imageFit: 'icon' as const } : { icon: 'app-window' }) },
    config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: newId(), action: 'system.launch', params: { path: `shell:AppsFolder\\${app.id}`, args: '' } }] } },
  };
}

/** Choose what goes in an empty cell: a ready-made button, a blank one, or a folder. */
export function PresetPicker({ danger, onPick, onClose }: { danger: Set<string>; onPick(p: PresetChoice): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'ready' | 'apps'>('ready');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? PRESETS.filter(p => `${p.label} ${p.group}`.toLowerCase().includes(s)) : PRESETS;
  }, [q]);
  const groups = [...new Set(shown.map(p => p.group))];

  return (
    <Modal title="Add a button" onClose={onClose} width={660}>
      <div class="segmented picker-tabs" role="tablist" aria-label="What to add">
        <button type="button" role="tab" aria-selected={tab === 'ready'} class={tab === 'ready' ? 'seg on' : 'seg'} onClick={() => setTab('ready')}>Ready-made</button>
        <button type="button" role="tab" aria-selected={tab === 'apps'} class={tab === 'apps' ? 'seg on' : 'seg'} onClick={() => setTab('apps')}>Apps on this PC</button>
      </div>
      {tab === 'apps' ? <AppList q={q} setQ={setQ} onPick={a => onPick({ app: a })} /> : <>
      <input class="input" placeholder="Search, for example volume or copy" value={q} aria-label="Search ready-made buttons"
        onInput={e => setQ((e.target as HTMLInputElement).value)}
        onKeyDown={e => { if (e.key === 'Enter' && shown[0]) onPick(shown[0]); }} />
      <div class="preset-list">
        {!q && (
          <div class="preset-start">
            <button type="button" class="preset-plain" onClick={() => onPick('blank')}><Icon name="plus-circle" size={20} /><span><b>Blank button</b><small>Choose the look and actions yourself</small></span></button>
            <button type="button" class="preset-plain" onClick={() => onPick('folder')}><Icon name="folder-plus" size={20} /><span><b>Folder</b><small>A button that opens more buttons</small></span></button>
          </div>
        )}
        {groups.map(g => (
          <section key={g} class="preset-group" aria-label={g}>
            <h3>{g}</h3>
            <div class="preset-grid">
              {shown.filter(p => p.group === g).map(p => <PresetKey key={p.id} p={p} careful={p.steps.some(s => danger.has(s.action))} onPick={() => onPick(p)} />)}
            </div>
          </section>
        ))}
        {shown.length === 0 && <p class="muted preset-empty">No ready-made button matches “{q}”. Try Apps on this PC, or add a blank button and set it up in the inspector.</p>}
      </div>
      </>}
    </Modal>
  );
}

function PresetKey({ p, careful, onPick }: { p: Preset; careful: boolean; onPick(): void }) {
  const t = tileStyle({ ...DEFAULT_LOOK, icon: p.icon, bg: p.bg, fg: p.fg ?? DEFAULT_LOOK.fg }, 56);
  return (
    <button type="button" class="preset" onClick={onPick} title={careful ? `${p.label}: can turn the PC off or lose unsaved work` : p.label}>
      <span class="preset-cap">
        <span class="tb-tile" style={{ ...t.style, left: 0, top: 0, width: '100%', height: '100%' }}>
          <Icon class="tb-tile-icon" name={p.icon} size={Math.round(56 * 0.36)} style={{ transform: 'translate(-50%, -50%)' }} />
        </span>
      </span>
      <span class="preset-label">{p.label}</span>
      {careful && <span class="preset-careful">Careful</span>}
    </button>
  );
}

/** Every app in the Start menu, searchable, with its real icon (fetched as each one scrolls into view). */
function AppList({ q, setQ, onPick }: { q: string; setQ(s: string): void; onPick(a: App): void }) {
  const api = useApi();
  const [apps, setApps] = useState<App[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.cmd<App[]>('apps.list', {}).then(setApps, () => setFailed(true)); }, []);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return (apps ?? []).filter(a => !s || a.name.toLowerCase().includes(s)); }, [apps, q]);
  return (
    <>
      <input class="input" placeholder="Search your apps, for example Slack" value={q} aria-label="Search apps on this PC"
        onInput={e => setQ((e.target as HTMLInputElement).value)}
        onKeyDown={e => { if (e.key === 'Enter' && shown[0]) onPick(shown[0]); }} />
      <div class="preset-list">
        {failed ? <p class="muted preset-empty">Could not read the app list from Windows. Add a blank button and choose the program in the inspector.</p>
          : !apps ? <p class="muted preset-empty">Finding the apps on this PC…</p>
          : !shown.length ? <p class="muted preset-empty">No app matches “{q}”.</p>
          : <div class="preset-grid app-grid">{shown.map(a => <AppKey key={a.id} app={a} onPick={() => onPick(a)} />)}</div>}
      </div>
    </>
  );
}

// Icons come one at a time from the PC (about 0.1 s each); only the ones on screen are asked for, two at a time.
const iconQueue: (() => Promise<void>)[] = [];
let iconsRunning = 0;
function queueIcon(job: () => Promise<void>) {
  iconQueue.push(job);
  const pump = () => { while (iconsRunning < 2 && iconQueue.length) { iconsRunning++; void iconQueue.shift()!().finally(() => { iconsRunning--; pump(); }); } };
  pump();
}

function AppKey({ app, onPick }: { app: App; onPick(): void }) {
  const api = useApi();
  const el = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const node = el.current; if (!node) return;
    let live = true;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      queueIcon(() => live ? api.cmd<{ dataUrl: string | null }>('apps.icon', { id: app.id }).then(r => { if (live) setSrc(r.dataUrl); }, () => { if (live) setSrc(null); }) : Promise.resolve());
    }, { rootMargin: '120px' });
    io.observe(node);
    return () => { live = false; io.disconnect(); };
  }, [app.id]);
  return (
    <button ref={el} type="button" class="preset" onClick={onPick} title={app.name}>
      <span class="preset-cap app-cap">
        {src ? <img src={src} alt="" width={40} height={40} draggable={false} /> : src === null ? <Icon name="app-window" size={24} /> : <span class="app-wait" />}
      </span>
      <span class="preset-label">{app.name}</span>
    </button>
  );
}
