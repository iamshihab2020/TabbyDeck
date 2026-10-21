import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { LogLine } from '@tabbydeck/shared';

export type Level = LogLine['level'];
export interface Logger {
  debug(source: string, msg: string, data?: Record<string, unknown>): void;
  info(source: string, msg: string, data?: Record<string, unknown>): void;
  warn(source: string, msg: string, data?: Record<string, unknown>): void;
  error(source: string, msg: string, data?: Record<string, unknown>): void;
  tail(n: number): LogLine[];
  on(listener: (line: LogLine) => void): () => void;
  clear(): void;
}

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const REDACT = new Set(['token', 'code', 'password', 'secret']);
const RING = 500;

function redact(data?: Record<string, unknown>) {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = REDACT.has(k) ? '[redacted]' : v;
  return out;
}

export function createLogger(opts: { dir: string; level: Level; maxFiles?: number; console?: boolean }): Logger {
  const maxFiles = opts.maxFiles ?? 5;
  mkdirSync(opts.dir, { recursive: true });
  const ring: LogLine[] = [];
  const listeners = new Set<(l: LogLine) => void>();
  let currentDay = '';

  const prune = () => {
    const files = readdirSync(opts.dir).filter(f => /^tabby-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - maxFiles))) rmSync(path.join(opts.dir, f), { force: true });
  };

  const write = (level: Level, source: string, msg: string, data?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[opts.level]) return;
    const ts = new Date().toISOString();
    const line: LogLine = { ts, level, source, msg, ...(data ? { data: redact(data) } : {}) };
    const day = ts.slice(0, 10);
    const text = `${ts} ${level.toUpperCase()} [${source}] ${msg}${line.data ? ' ' + JSON.stringify(line.data) : ''}\n`;
    try {
      appendFileSync(path.join(opts.dir, `tabby-${day}.log`), text);
      if (day !== currentDay) { currentDay = day; prune(); }
    } catch { /* logging must never crash the host */ }
    if (opts.console) process.stdout.write(text);
    ring.push(line);
    if (ring.length > RING) ring.shift();
    for (const l of listeners) l(line);
  };

  return {
    debug: (s, m, d) => write('debug', s, m, d),
    info: (s, m, d) => write('info', s, m, d),
    warn: (s, m, d) => write('warn', s, m, d),
    error: (s, m, d) => write('error', s, m, d),
    tail: n => ring.slice(-n),
    on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    clear: () => { ring.length = 0; },
  };
}

/** A logger that drops everything; for tests that do not care. */
export function nullLogger(): Logger {
  return { debug() {}, info() {}, warn() {}, error() {}, tail: () => [], on: () => () => {}, clear() {} };
}
