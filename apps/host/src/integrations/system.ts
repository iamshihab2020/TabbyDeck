import type { ActionRegistry } from '../engine/registry.ts';
import type { Native } from '../native/types.ts';

/** Split an argument string, honouring double quotes: a  "b c"  ->  [a, b c]. */
export function splitArgs(s: string): string[] {
  const out: string[] = []; let cur = ''; let q = false; let has = false;
  for (const ch of s) {
    if (ch === '"') { q = !q; has = true; continue; }
    if (!q && /\s/.test(ch)) { if (has || cur) out.push(cur); cur = ''; has = false; continue; }
    cur += ch; has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}

/** Expand Windows-style %NAME% variables (case-insensitive); unknown names stay as written. */
export function expandEnv(s: string): string {
  return s.replace(/%([A-Za-z_][A-Za-z0-9_()]*)%/g, (m, name: string) => {
    const key = Object.keys(process.env).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? process.env[key]! : m;
  });
}

// http(s), mailto and app protocol links (spotify:, steam:, ms-settings:, …). Not file:, javascript:, data: or vbscript:.
const SAFE_URL = /^(https?:\/\/|mailto:|[a-z][a-z0-9+.-]{1,30}:)/i;
const BLOCKED_SCHEME = /^(file|javascript|data|vbscript|about|shell):/i;

export function registerSystem(registry: ActionRegistry, deps: { native: Native }): void {
  const { system } = deps.native;
  registry.register({
    id: 'system.launch', name: 'Open app or file', group: 'System', description: 'Start a program or open a file, folder or shortcut',
    schema: { path: { type: 'path', title: 'Program or file', required: true }, args: { type: 'string', title: 'Arguments' } },
    run: async p => system.launch(expandEnv(String(p.path).trim()), splitArgs(String(p.args ?? ''))),
  });
  registry.register({
    id: 'system.openUrl', name: 'Open website or link', group: 'System',
    schema: { url: { type: 'string', title: 'Address', required: true } },
    run: async p => {
      const url = String(p.url).trim();
      if (BLOCKED_SCHEME.test(url) || !SAFE_URL.test(url)) throw new Error(`Links like "${url.slice(0, 40)}" are not allowed`);
      await system.openUrl(url);
    },
  });
  registry.register({
    id: 'system.run', name: 'Run command', group: 'System', danger: true, description: 'Runs a command line on this computer',
    schema: { command: { type: 'text', title: 'Command', required: true }, timeout: { type: 'number', title: 'Time limit (seconds)', default: 30, min: 1, max: 600 } },
    run: async p => {
      const r = await system.run(String(p.command), Number(p.timeout) * 1000);
      if (r.code !== 0) throw new Error(`Command exited with code ${r.code}${r.out ? `: ${r.out.trim().slice(0, 200)}` : ''}`);
    },
  });
  registry.register({
    id: 'system.kill', name: 'Close app (force)', group: 'System', danger: true,
    schema: { process: { type: 'string', title: 'Process name, e.g. chrome.exe', required: true } },
    run: async p => { if ((await system.kill(String(p.process).trim())) === 0) throw new Error(`${p.process} is not running`); },
  });
  registry.register({
    id: 'system.focus', name: 'Switch to window', group: 'System',
    schema: { title: { type: 'window', title: 'App or window title', required: true } },
    run: async p => { if (!(await system.focusWindow(String(p.title)))) throw new Error(`No window matches "${p.title}"`); },
  });
  registry.register({ id: 'system.lock', name: 'Lock computer', group: 'System', schema: {}, run: () => system.lock() });
  registry.register({ id: 'system.sleep', name: 'Sleep', group: 'System', danger: true, schema: {}, run: () => system.sleep() });
  registry.register({
    id: 'system.shutdown', name: 'Shut down or restart', group: 'System', danger: true,
    schema: { restart: { type: 'boolean', title: 'Restart instead', default: false } },
    run: p => system.shutdown(Boolean(p.restart)),
  });
  registry.register({ id: 'system.clipboard', name: 'Copy text to clipboard', group: 'System', schema: { text: { type: 'text', title: 'Text', required: true } }, run: p => system.clipboardSet(String(p.text)) });
  registry.register({ id: 'system.screenshot', name: 'Screenshot to clipboard', group: 'System', schema: {}, run: () => system.screenshotToClipboard() });
}
