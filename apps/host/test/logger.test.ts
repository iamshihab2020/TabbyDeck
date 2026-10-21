import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLogger } from '../src/log/logger.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-log-')); });
afterEach(() => { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

describe('logger', () => {
  it('writes a line to today\'s file', () => {
    const log = createLogger({ dir, level: 'info' });
    log.info('test', 'hello');
    const today = new Date().toISOString().slice(0, 10);
    const content = readFileSync(path.join(dir, `tabby-${today}.log`), 'utf8');
    expect(content).toContain('hello');
    expect(content).toContain('[test]');
  });

  it('tail returns the last lines in order', () => {
    const log = createLogger({ dir, level: 'info' });
    log.info('a', 'one'); log.info('a', 'two'); log.info('a', 'three');
    expect(log.tail(2).map(l => l.msg)).toEqual(['two', 'three']);
  });

  it('skips lines below the level', () => {
    const log = createLogger({ dir, level: 'info' });
    log.debug('a', 'hidden');
    expect(log.tail(10)).toHaveLength(0);
  });

  it('redacts token, code, password and secret keys in file and tail', () => {
    const log = createLogger({ dir, level: 'info' });
    log.info('auth', 'paired', { token: 'abc123', code: '482913', password: 'p', secret: 's', name: 'phone' });
    const line = log.tail(1)[0];
    expect(line.data).toEqual({ token: '[redacted]', code: '[redacted]', password: '[redacted]', secret: '[redacted]', name: 'phone' });
    const file = readdirSync(dir)[0];
    const content = readFileSync(path.join(dir, file), 'utf8');
    expect(content).not.toContain('abc123');
    expect(content).not.toContain('482913');
  });

  it('keeps at most maxFiles daily files', () => {
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) writeFileSync(path.join(dir, `tabby-${d}.log`), 'x');
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    const log = createLogger({ dir, level: 'info', maxFiles: 5 });
    log.info('a', 'six');
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(5);
    expect(files).not.toContain('tabby-2026-10-01.log');
    expect(files).toContain('tabby-2026-10-06.log');
  });

  it('notifies listeners and clear empties the tail', () => {
    const log = createLogger({ dir, level: 'info' });
    const seen: string[] = [];
    const off = log.on(l => seen.push(l.msg));
    log.warn('a', 'w'); off(); log.warn('a', 'x');
    expect(seen).toEqual(['w']);
    log.clear();
    expect(log.tail(10)).toHaveLength(0);
  });
});
