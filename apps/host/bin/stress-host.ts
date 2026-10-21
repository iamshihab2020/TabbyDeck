// Stress check (not shipped): does the host itself crash under repeated start / pair / press / shutdown?
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createHost } from '../src/host.ts';
import { nullLogger } from '../src/log/logger.ts';

const rounds = Number(process.argv[2] ?? 300);
for (let i = 1; i <= rounds; i++) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tabby-stress-'));
  const host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
  const socks: WebSocket[] = [];
  for (let c = 0; c < 3; c++) {
    const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
    socks.push(ws);
    await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
    const msgs: string[] = [];
    ws.on('message', d => msgs.push(String(d)));
    ws.send(JSON.stringify({ t: 'hello', deviceId: `d${c}`, name: 'x', clientVersion: '0', caps: { vibrate: false, wakeLock: false } }));
    while (!msgs.some(m => m.includes('pairRequired'))) await new Promise(r => setTimeout(r, 1));
    host.pairing.approve(`d${c}`, JSON.parse(msgs.find(m => m.includes('pairRequired'))!).code);
    while (!msgs.some(m => m.includes('"deck"'))) await new Promise(r => setTimeout(r, 1));
    ws.send(JSON.stringify({ t: 'press', widgetId: host.store.profiles()[0].widgets[0].id, kind: 'press' }));
  }
  if (i % 2) socks[0].close(); // mix client-initiated and server-initiated closes
  await host.close();
  await host.store.flush();
  rmSync(dir, { recursive: true, force: true });
  if (i % 50 === 0) console.log(`round ${i} ok`);
}
console.log(`STRESS OK: ${rounds} rounds`);
