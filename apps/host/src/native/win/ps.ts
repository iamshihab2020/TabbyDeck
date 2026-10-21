import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/** Extra time allowed for a call that has to start PowerShell first. */
export const STARTUP_GRACE_MS = 25_000; // a cold PowerShell can take over 10 s on a busy or old PC

interface Prelude { key: string; script: string }
interface Pending { script: string; timeoutMs: number; prelude?: Prelude; resolve(v: string): void; reject(e: Error): void }

/**
 * One long-lived Windows PowerShell 5.1 (always installed, STA) that runs scripts serially. PowerShell's
 * `-Command -` mode reads stdin line by line, so each script is sent as one base64 line and decoded there.
 */
export class PowerShellHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private queue: Pending[] = [];
  private busy = false;
  private buf = '';
  private current: { p: Pending; sentinel: string; timer: NodeJS.Timeout } | null = null;
  private disposed = false;
  /** Setup scripts already run in the current process (cleared when it restarts). */
  private loaded = new Set<string>();

  /** Run a script. A prelude (e.g. Add-Type) runs once per PowerShell process before the first script that names it. */
  call(script: string, timeoutMs = 5000, prelude?: Prelude): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('PowerShell host disposed'));
    return new Promise((resolve, reject) => { this.queue.push({ script, timeoutMs, prelude, resolve, reject }); this.pump(); });
  }

  private ensure(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const c = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (d: string) => { this.buf += d; this.drain(); });
    c.stderr.on('data', () => {});
    c.on('exit', () => {
      if (this.child !== c) return; // an old process killed after a timeout; its successor owns the current call
      this.child = null;
      if (this.current) { clearTimeout(this.current.timer); this.current.p.reject(new Error('PowerShell exited')); this.current = null; this.busy = false; this.buf = ''; this.pump(); }
    });
    c.stdin.on('error', () => {});
    this.child = c;
    this.loaded.clear();
    return c;
  }

  private pump() {
    if (this.busy || this.disposed) return;
    const p = this.queue.shift();
    if (!p) return;
    this.busy = true;
    const sentinel = `@@TB${randomBytes(6).toString('hex')}@@`;
    const cold = !this.child; // starting PowerShell itself can take seconds on a busy PC
    this.ensure();
    const needPrelude = p.prelude && !this.loaded.has(p.prelude.key);
    const script = needPrelude ? `${p.prelude!.script}
${p.script}` : p.script;
    if (needPrelude) this.loaded.add(p.prelude!.key);
    const b64 = Buffer.from(script, 'utf8').toString('base64');
    // [scriptblock]::Create is ~5x faster than iex in a pipeline; dot-sourcing keeps prelude types and variables.
    const line = `try { $__r = (. ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))) | Out-String).TrimEnd(); Write-Output ('OK' + $__r) } catch { Write-Output ('ER' + $_.Exception.Message) }; Write-Output '${sentinel}'\n`;
    const timer = setTimeout(() => {
      const cur = this.current; if (!cur) return;
      this.current = null; this.busy = false; this.buf = '';
      const c = this.child; this.child = null; c?.kill();
      cur.p.reject(new Error(`PowerShell timeout after ${p.timeoutMs} ms`));
      this.pump();
    }, p.timeoutMs + (cold ? STARTUP_GRACE_MS : 0));
    this.current = { p, sentinel, timer };
    this.ensure().stdin.write(line);
  }

  private drain() {
    const cur = this.current; if (!cur) return;
    const i = this.buf.indexOf(cur.sentinel);
    if (i < 0) return;
    const out = this.buf.slice(0, i).replace(/\r/g, '').trim();
    this.buf = this.buf.slice(i + cur.sentinel.length).replace(/^\s+/, '');
    clearTimeout(cur.timer);
    this.current = null; this.busy = false;
    if (out.startsWith('ER')) cur.p.reject(new Error(out.slice(2).trim() || 'PowerShell error'));
    else cur.p.resolve(out.startsWith('OK') ? out.slice(2) : out);
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    for (const p of this.queue.splice(0)) p.reject(new Error('PowerShell host disposed'));
    this.child?.kill(); this.child = null;
  }
}

/** Quote a string as a PowerShell single-quoted literal. */
export const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
