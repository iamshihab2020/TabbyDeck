import { planReflow, type ClientMsg, type ProfileFile, type Widget } from '@tabbydeck/shared';
import { isBackground } from '@tabbydeck/shared/backgrounds';
import type { Store } from '../store/store.ts';
import type { AssetStore } from '../assets/store.ts';

/** A phone edit that cannot be done; the text goes back to that phone. */
export class PhoneEditError extends Error {}

type Edit = Extract<ClientMsg, { t: 'edit' }>;
type Background = Extract<ClientMsg, { t: 'background' }>;

const IMAGE_ERRORS: Record<string, string> = { too_large: 'That picture is too big (1 MB at most)', bad_type: 'That kind of picture cannot go on a key' };

async function saveImage(assets: AssetStore, dataUrl: string): Promise<string> {
  try { return (await assets.save('phone', dataUrl)).id; } catch (e) { throw new PhoneEditError(IMAGE_ERRORS[(e as { code?: string }).code ?? ''] ?? 'Could not save that picture'); }
}

/**
 * A key changed from a deck in edit mode, through the same store calls the editor uses, so the editor and every
 * other deck update at once. A move goes the editor's way: onto a key, the keys between shift along.
 * `hiddenHere` is true when the folder has keys the decks leave out, so the deck's places are not the real ones.
 */
export async function applyPhoneEdit(store: Store, assets: AssetStore, f: ProfileFile, w: Widget, m: Edit, hiddenHere: boolean): Promise<void> {
  if (m.remove) return store.deleteWidget(w.id);
  if (m.x !== undefined && m.y !== undefined && (m.x !== w.x || m.y !== w.y)) {
    if (hiddenHere) throw new PhoneEditError('Some keys here are hidden on this PC, so move keys in TabbyDeck on your PC');
    const moves = planReflow(f.widgets.filter(o => o.folderId === w.folderId), w.id, m.x, m.y, f.profile.cols, f.profile.rows);
    if (!moves) throw new PhoneEditError('No room there');
    if (moves.length) store.moveWidgets(moves);
  }
  const look = { ...w.look };
  let changed = false;
  if (m.label !== undefined) { const label = m.label.trim(); if (label) look.label = label; else delete look.label; changed = true; }
  if (m.icon !== undefined) { if (m.icon) look.icon = m.icon; else delete look.icon; changed = true; }
  if (m.bg) { look.bg = m.bg; changed = true; }
  if (m.image !== undefined) {
    delete look.imageFit; // a photo from the phone fills the key
    if (m.image) look.image = await saveImage(assets, m.image); else delete look.image;
    changed = true;
  }
  if (changed) store.updateWidget(w.id, { look });
  if (m.minutes !== undefined || m.focus !== undefined || m.rest !== undefined) {
    const press = w.config.kind === 'button' ? w.config.triggers.press ?? [] : [];
    const step = press[0];
    const fits = step?.action === 'timer.countdown' ? m.focus === undefined && m.rest === undefined : step?.action === 'timer.pomodoro' ? m.minutes === undefined : false;
    if (!fits || w.config.kind !== 'button') throw new PhoneEditError('Only a Timer or Pomodoro key has minutes to set');
    const params = { ...step.params, ...(m.minutes !== undefined ? { minutes: m.minutes } : {}), ...(m.focus !== undefined ? { focus: m.focus } : {}), ...(m.rest !== undefined ? { rest: m.rest } : {}) };
    store.updateWidget(w.id, { config: { ...w.config, triggers: { ...w.config.triggers, press: [{ ...step, params }, ...press.slice(1)] } } });
  }
}

/** The current profile's background from a deck in edit mode: a ready-made one, a photo, or both. */
export async function applyPhoneBackground(store: Store, assets: AssetStore, profileId: string, m: Background): Promise<void> {
  if (m.bg !== undefined && !isBackground(m.bg)) throw new PhoneEditError('That background is not one of the choices');
  const patch: { bg?: string; bgImage?: string } = m.bg ? { bg: m.bg } : {};
  if (m.image) patch.bgImage = await saveImage(assets, m.image);
  else if (m.image === null) patch.bgImage = undefined;
  store.updateProfile(profileId, patch);
}
