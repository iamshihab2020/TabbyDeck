import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NativeInput } from '../types.ts';
import { MODIFIERS } from './keys.ts';

/**
 * Tracks keys currently held down on disk, so a crash mid-sequence cannot leave Ctrl or Shift stuck:
 * the next start releases whatever the file lists. Written synchronously before each key-down.
 */
export class HeldKeys {
  private down = new Set<number>();
  private file: string;
  constructor(dataDir: string, private input: NativeInput) { this.file = path.join(dataDir, 'held.json'); }

  keyDown(vk: number): void {
    this.down.add(vk);
    this.save();
    try { this.input.keyDown(vk); } catch (e) { this.down.delete(vk); this.save(); throw e; }
  }
  keyUp(vk: number): void {
    try { this.input.keyUp(vk); } finally { this.down.delete(vk); this.save(); }
  }
  releaseAll(): void { for (const vk of [...this.down].reverse()) { try { this.keyUp(vk); } catch { /* keep releasing the rest */ } } }

  private save() {
    try {
      if (this.down.size) writeFileSync(this.file, JSON.stringify([...this.down]));
      else rmSync(this.file, { force: true });
    } catch { /* best effort */ }
  }
}

/** On start: release anything a previous run left held, plus all modifiers, then delete the record. */
export function releaseAllOnStart(input: NativeInput, dataDir: string): void {
  const file = path.join(dataDir, 'held.json');
  if (!existsSync(file)) return;
  let keys: number[] = [];
  try { const v = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(v)) keys = v.filter(k => Number.isInteger(k) && k > 0 && k < 256); } catch { /* corrupt: still release modifiers */ }
  for (const vk of [...keys, ...MODIFIERS.filter(m => !keys.includes(m))]) { try { input.keyUp(vk); } catch { /* continue */ } }
  rmSync(file, { force: true });
}
