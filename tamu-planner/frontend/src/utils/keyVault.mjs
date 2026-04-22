/**
 * keyVault.mjs
 *
 * Encrypts a user-supplied API key using AES-GCM (Web Crypto API) and stores
 * only the ciphertext + IV in sessionStorage. The CryptoKey itself lives only
 * in memory and is never serialised anywhere.
 *
 * Usage pattern:
 *   storeApiKey(rawKey)      — encrypt + write to sessionStorage
 *   retrieveApiKey()         — decrypt ONLY at request time; let result go out
 *                              of scope immediately after use
 *   hasStoredApiKey()        — check without decrypting
 *   clearApiKey()            — wipe sessionStorage + in-memory key
 *   hasSeenModal() / markModalSeen() — one-per-session modal flag
 */

// In-memory CryptoKey — never written anywhere; lost when tab closes.
let _cryptoKey = null;

const SS_ENC  = 'df_enc_k';
const SS_IV   = 'df_enc_iv';
const SS_SEEN = 'df_modal_seen';

// Wipe on tab close so ciphertext without the CryptoKey is harmless anyway.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem(SS_ENC);
    sessionStorage.removeItem(SS_IV);
    _cryptoKey = null;
  });
}

async function getCryptoKey() {
  if (_cryptoKey) return _cryptoKey;
  _cryptoKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,               // non-extractable — cannot be exported from memory
    ['encrypt', 'decrypt']
  );
  return _cryptoKey;
}

const toB64   = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)));
const fromB64 = (s)   => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encrypt rawKey and write ciphertext+IV to sessionStorage. */
export async function storeApiKey(rawKey) {
  const ck  = await getCryptoKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    ck,
    new TextEncoder().encode(rawKey)
  );
  sessionStorage.setItem(SS_ENC, toB64(ct));
  sessionStorage.setItem(SS_IV,  toB64(iv));
}

/**
 * Decrypt and return the stored API key.
 * Call ONLY immediately before attaching it to a request header.
 * Do not store the returned string in state, refs, or variables that outlive
 * the request function.
 */
export async function retrieveApiKey() {
  const enc = sessionStorage.getItem(SS_ENC);
  const iv  = sessionStorage.getItem(SS_IV);
  if (!enc || !iv || !_cryptoKey) return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(iv) },
      _cryptoKey,
      fromB64(enc)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** True if an encrypted key is in sessionStorage (does not decrypt). */
export const hasStoredApiKey = () =>
  Boolean(sessionStorage.getItem(SS_ENC) && sessionStorage.getItem(SS_IV));

/** Remove ciphertext from sessionStorage and drop the in-memory key. */
export const clearApiKey = () => {
  sessionStorage.removeItem(SS_ENC);
  sessionStorage.removeItem(SS_IV);
  _cryptoKey = null;
};

/** Whether the user has already made a key selection this session. */
export const hasSeenModal  = () => sessionStorage.getItem(SS_SEEN) === '1';
export const markModalSeen = () => sessionStorage.setItem(SS_SEEN, '1');
