import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import type { AudioOutput } from '@tabbydeck/shared';
import { OutputPanel } from '../src/screens/Brightness.tsx';

const noop = () => {};
const speakers: AudioOutput = { id: 'spk', name: 'Speakers (Realtek(R) Audio)', isDefault: true };
const headphones: AudioOutput = { id: 'hp', name: 'Headphones (WH-1000XM4)', isDefault: false };
const list = (outputs?: AudioOutput[]) => render(<OutputPanel outputs={outputs} onOutput={noop} onClose={noop} />);

/** Each choice in the list: whether it is checked, its icon and its text. */
const choices = (html: string) => [...html.matchAll(/<button[^>]*role="radio"[^>]*>[\s\S]*?<\/button>/g)].map(([b]) => ({
  checked: /aria-checked="true"/.test(b), icon: /href="#i-([a-z-]+)"/.exec(b)?.[1], text: b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
}));

describe('the sound output list', () => {
  it('lists each output by its name with its driver under it, and checks the one the PC plays through', () => {
    const html = list([speakers, headphones]);
    expect(html).toContain('Sound output');
    expect(choices(html)).toEqual([
      { checked: true, icon: 'speaker-high', text: expect.stringMatching(/^Speakers Realtek\(R\) Audio/) },
      { checked: false, icon: 'headphones', text: 'Headphones WH-1000XM4' },
    ]);
  });
  it('says it is reading until the PC sends the outputs', () => {
    expect(list(undefined)).toContain('Reading from the PC');
    expect(choices(list(undefined))).toEqual([]);
  });
  it('says so when no output is connected, and when there is only one to choose', () => {
    expect(list([])).toContain('No sound output is connected');
    const one = list([speakers]);
    expect(choices(one)).toHaveLength(1);
    expect(one).toContain('Connect headphones or speakers to choose between them');
  });
});
