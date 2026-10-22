import { describe, expect, it } from 'vitest';
import { PRESETS } from '@tabbydeck/shared/presets';
import { starterProfileFile } from '@tabbydeck/shared';
import { ICON_NAMES } from '@tabbydeck/ui';
import { appWidget, appsWidget, presetWidget } from '../src/components/PresetPicker.tsx';

describe('presets in the editor', () => {
  it('every preset and starter-deck icon is in the icon set', () => {
    const known = new Set(ICON_NAMES);
    expect(starterProfileFile().widgets.filter(w => !known.has(w.look.icon!)).map(w => w.look.icon)).toEqual([]);
    expect(PRESETS.filter(p => !known.has(p.icon)).map(p => `${p.id}: ${p.icon}`)).toEqual([]);
  });
  it('a preset becomes a button at the chosen cell with its look and press steps', () => {
    const w = presetWidget(PRESETS.find(p => p.id === 'play-pause')!, 2, 1);
    expect(w).toMatchObject({ x: 2, y: 1, w: 1, h: 1, look: { label: 'Play', icon: 'play', bg: '#f5a524', fg: '#2a1a00' } });
    expect(w.config).toMatchObject({ kind: 'button', policy: 'ignore', triggers: { press: [{ action: 'keyboard.hotkey', params: { hotkey: 'MediaPlayPause' } }] } });
    const step = (w.config as { triggers: { press: { id: string }[] } }).triggers.press[0];
    expect(step.id).toMatch(/^[a-z0-9]{16}$/);
  });
  it('an app becomes a button that opens it through the Start menu, showing its icon at icon size', () => {
    const w = appWidget({ id: 'com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack', name: 'Slack' }, 'abc.png', 1, 2);
    expect(w).toMatchObject({ x: 1, y: 2, look: { label: 'Slack', image: 'abc.png', imageFit: 'icon' } });
    expect(w.config).toMatchObject({ kind: 'button', triggers: { press: [{ action: 'system.launch', params: { path: 'shell:AppsFolder\\com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack' } }] } });
    expect(appWidget({ id: 'x', name: 'No icon' }, undefined, 0, 0).look).toMatchObject({ icon: 'app-window' });
  });
  it('several apps become one button with a Launch step for each, in the order picked', () => {
    const w = appsWidget([{ id: 'Microsoft.VisualStudioCode', name: 'Visual Studio Code' }, { id: 'com.squirrel.GitHubDesktop.GitHubDesktop', name: 'GitHub Desktop' }, { id: 'Chrome', name: 'Google Chrome' }], 1, 2);
    expect(w).toMatchObject({ x: 1, y: 2, w: 1, h: 1, look: { label: '3 apps', icon: 'rocket-launch' } });
    if (w.config.kind !== 'button') throw new Error('not a button');
    const steps = w.config.triggers.press!;
    expect(steps.map(s => [s.action, s.params.path])).toEqual([
      ['system.launch', 'shell:AppsFolder\\Microsoft.VisualStudioCode'],
      ['system.launch', 'shell:AppsFolder\\com.squirrel.GitHubDesktop.GitHubDesktop'],
      ['system.launch', 'shell:AppsFolder\\Chrome'],
    ]);
    expect(new Set(steps.map(s => s.id)).size).toBe(3);
  });
});
