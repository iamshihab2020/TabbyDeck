/** Pictures from the phone's camera or gallery, cropped to a key's or the screen's shape and made small enough to send. */

export interface Size { w: number; h: number }

/** The PC keeps pictures up to 1 MB; as base64 that is about this many characters. */
export const MAX_DATA_URL = 1_390_000;

/** Scale that has the image cover the frame at zoom 1, larger when zoomed in. */
export const coverScale = (img: Size, frame: Size, zoom: number) => Math.max(frame.w / img.w, frame.h / img.h) * zoom;

/** Keep the image's top left (in frame px) where the image still covers the whole frame. */
export function clampOffset(x: number, y: number, img: Size, scale: number, frame: Size): { x: number; y: number } {
  return { x: Math.min(0, Math.max(frame.w - img.w * scale, x)), y: Math.min(0, Math.max(frame.h - img.h * scale, y)) };
}

/** The part of the image the frame shows, in image px. */
export const sourceRect = (off: { x: number; y: number }, scale: number, frame: Size) => ({ x: -off.x / scale, y: -off.y / scale, w: frame.w / scale, h: frame.h / scale });

/** The output's size: the crop's shape, at most `max` px on its long side, and never larger than the crop itself. */
export function outSize(crop: Size, max: number): Size {
  const k = Math.min(1, max / Math.max(crop.w, crop.h));
  return { w: Math.max(1, Math.round(crop.w * k)), h: Math.max(1, Math.round(crop.h * k)) };
}

export function readFile(file: Blob): Promise<string> {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(file); });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('not a picture')); i.src = src; });
}

/** Draw the crop at `out` and encode it: WebP where the browser can (it keeps transparency), JPEG elsewhere, smaller until it fits. */
export function encodeCrop(img: HTMLImageElement, crop: { x: number; y: number; w: number; h: number }, out: Size): string | null {
  const c = document.createElement('canvas');
  c.width = out.w; c.height = out.h;
  const g = c.getContext('2d'); if (!g) return null;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, out.w, out.h);
  for (const q of [0.86, 0.72, 0.55]) {
    let url = c.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', q); // Safari has no WebP encoder
    if (url.length <= MAX_DATA_URL) return url;
  }
  return null;
}
