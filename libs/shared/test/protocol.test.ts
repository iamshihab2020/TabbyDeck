import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClientMsgSchema, HostMsgSchema, EditorMsgSchema } from '../src/index.ts';

const dir = fileURLToPath(new URL('../fixtures/protocol/', import.meta.url));
const schemas = { client: ClientMsgSchema, host: HostMsgSchema, editor: EditorMsgSchema } as const;

describe('protocol fixtures', () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  it('has a fixture for every client and host message type', () => {
    const names = files.map(f => f.replace('.json', ''));
    for (const t of ['hello', 'press', 'open', 'profile', 'ping']) expect(names).toContain(`client.${t}`);
    for (const t of ['pairRequired', 'welcome', 'denied', 'blocked', 'timeout', 'deck', 'patch', 'notify', 'pong']) expect(names).toContain(`host.${t}`);
    expect(names).toContain('editor.cmd');
  });
  for (const f of files) {
    it(`${f} parses with its schema`, () => {
      const kind = f.split('.')[0] as keyof typeof schemas;
      const msg = JSON.parse(readFileSync(dir + f, 'utf8'));
      expect(() => schemas[kind].parse(msg)).not.toThrow();
    });
  }
});

describe('client message validation', () => {
  it('rejects unknown t', () => {
    expect(ClientMsgSchema.safeParse({ t: 'explode' }).success).toBe(false);
  });
  it('rejects hello without deviceId', () => {
    expect(ClientMsgSchema.safeParse({ t: 'hello', name: 'x', clientVersion: '1', caps: { vibrate: true, wakeLock: false } }).success).toBe(false);
  });
  it('rejects press with kind tap', () => {
    expect(ClientMsgSchema.safeParse({ t: 'press', widgetId: 'a', kind: 'tap' }).success).toBe(false);
  });
  it('takes only a #rrggbb key colour from a phone edit, so nothing else reaches the key\'s style', () => {
    expect(ClientMsgSchema.safeParse({ t: 'edit', widgetId: 'a', bg: '#3b2a4d' }).success).toBe(true);
    for (const bg of ['red', '#fff', 'url(x)', '#000000; background-image: url(x)']) expect(ClientMsgSchema.safeParse({ t: 'edit', widgetId: 'a', bg }).success).toBe(false);
  });
  it('rejects editor cmd with an unknown command name', () => {
    expect(EditorMsgSchema.safeParse({ t: 'cmd', id: '1', name: 'nuke', args: {} }).success).toBe(false);
  });
});
