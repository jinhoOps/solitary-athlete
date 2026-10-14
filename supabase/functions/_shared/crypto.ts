function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
async function tokenKey(base64: string) {
  const raw = bytes(base64);
  if (raw.length !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptToken(token: string, key: string, interactionId: string): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(interactionId) }, await tokenKey(key), new TextEncoder().encode(token));
  const result = new Uint8Array(12 + encrypted.byteLength); result.set(iv); result.set(new Uint8Array(encrypted), 12); return result;
}
export async function decryptToken(cipher: Uint8Array, key: string, interactionId: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(cipher.slice(0, 12)),
    additionalData: new TextEncoder().encode(interactionId) }, await tokenKey(key), new Uint8Array(cipher.slice(12)));
  return new TextDecoder().decode(decrypted);
}
