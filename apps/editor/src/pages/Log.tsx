import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LogLine } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** What TabbyDeck has been doing, newest last, updating live. */
export function LogPage() {
  const api = useApi();
  const { state } = useSnapshot();
  const [lines, setLines] = useState<LogLine[]>(() => state!.log);
  const [min, setMin] = useState<LogLine['level']>('info');
  const [source, setSource] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => api.onEvent('log', l => setLines(x => [...x.slice(-499), l as LogLine])), [api]);
  const shown = useMemo(() => lines.filter(l => LEVELS.indexOf(l.level) >= LEVELS.indexOf(min) && (!source || l.source === source)), [lines, min, source]);
  const sources = useMemo(() => [...new Set(lines.map(l => l.source))].sort(), [lines]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [shown.length]);

  return (
    <section class="log-page" aria-labelledby="h-log">
      <header class="log-bar">
        <h1 id="h-log">Log</h1>
        <div class="segmented" role="radiogroup" aria-label="Show">
          {(['info', 'warn', 'error', 'debug'] as const).map(l => <button key={l} type="button" role="radio" aria-checked={min === l} class={min === l ? 'seg on' : 'seg'} onClick={() => setMin(l)}>{l === 'info' ? 'Normal' : l === 'warn' ? 'Warnings' : l === 'error' ? 'Errors' : 'Everything'}</button>)}
        </div>
        <select class="input log-source" value={source} onChange={e => setSource((e.target as HTMLSelectElement).value)} aria-label="Part of TabbyDeck">
          <option value="">All parts</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" class="btn" onClick={() => { void api.cmd('log.clear', {}).catch(() => {}); setLines([]); }}>Clear</button>
        <button type="button" class="btn" onClick={() => void api.cmd('editor.openDataDir', {}).catch(() => {})}><Icon name="folder-open" size={16} />Log files</button>
      </header>
      <div class="log-list" role="log" aria-live="polite">
        {shown.length === 0 && <p class="muted log-empty">Nothing to show yet.</p>}
        {shown.map((l, i) => (
          <div key={i} class={`log-line ${l.level}`}>
            <time>{new Date(l.ts).toLocaleTimeString()}</time>
            <span class="log-src">{l.source}</span>
            <span class="log-msg">{l.msg}{l.data ? <span class="log-data"> {JSON.stringify(l.data)}</span> : null}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
