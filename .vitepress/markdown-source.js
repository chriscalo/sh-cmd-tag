// Markdown page source is handed to the browser as base64 so it can ride
// along in the page data without escaping problems. `btoa`/`atob` only speak
// binary (Latin-1) strings, so text has to be converted to and from UTF-8
// bytes explicitly — otherwise every non-ASCII character in a page (an em
// dash, an ellipsis, a curly quote) comes back mangled.
//
// Both helpers use only web-standard APIs, so the same module works in the
// Node build step and in the browser bundle.

/**
 * Encodes text as base64, preserving non-ASCII characters.
 * @param {string} text - The text to encode
 * @returns {string} Base64 of the text's UTF-8 bytes
 */
export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Decodes base64 produced by `encodeBase64Utf8()` back to text.
 * @param {string} base64 - Base64 of UTF-8 bytes
 * @returns {string} The decoded text
 */
export function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
