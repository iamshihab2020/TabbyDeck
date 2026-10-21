const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 16-char random id from a-z0-9. */
export function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}
