import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { starterProfileFiles } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { AssetStore } from '../src/assets/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { fitStarterApps } from '../src/engine/starterApps.ts';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('starter apps', () => {
  it('on a fresh install, app keys get the PC\'s app by id or by name, with its icon; apps it lacks stay as they were', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tabby-starter-'));
    const store = new Store({ dir, log: nullLogger(), firstRun: starterProfileFiles });
    await store.load();
    expect(store.fresh).toBe(true);
    await fitStarterApps({ store, assets: new AssetStore(store), native: createFakeNative() });
    const key = (label: string) => store.profiles()[0].widgets.find(w => w.look.label === label)!;
    const launch = (label: string) => (key(label).config as unknown as { triggers: { press: { params: { path: string } }[] } }).triggers.press[0].params.path;
    expect(launch('Calculator')).toBe('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App');
    expect(key('Calculator').look).toMatchObject({ imageFit: 'icon', image: expect.stringMatching(/\.png$/) });
    expect(launch('File Pilot')).toBe('shell:AppsFolder\\C:AppsPilot.exe'); // found by name (the fake's id, whose backslashes its source drops)
    expect(key('File Pilot').look.image).toBeDefined();
    expect(launch('Slack')).toMatch(/slackdesktop/);
    expect(key('Slack').look.image).toBeUndefined();
    await store.flush();
    const again = new Store({ dir, log: nullLogger(), firstRun: starterProfileFiles });
    await again.load();
    expect(again.fresh).toBe(false);
  });
});
