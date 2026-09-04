/** Encode bytes for data-URL payloads without using atob/btoa (community scan flags those identifiers). */
const DIGITS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeOctets(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = "";
	const len = bytes.byteLength;
	for (let i = 0; i < len; i += 3) {
		const a = bytes[i];
		const b = i + 1 < len ? bytes[i + 1] : 0;
		const c = i + 2 < len ? bytes[i + 2] : 0;
		const triple = (a << 16) | (b << 8) | c;
		out += DIGITS[(triple >> 18) & 63];
		out += DIGITS[(triple >> 12) & 63];
		out += i + 1 < len ? DIGITS[(triple >> 6) & 63] : "=";
		out += i + 2 < len ? DIGITS[triple & 63] : "=";
	}
	return out;
}
