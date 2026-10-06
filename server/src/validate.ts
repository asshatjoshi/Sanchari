// Returns the 10-digit Indian mobile number, or null if it isn't one.
// Accepts spaces, dashes and a +91 / 91 / 0 prefix.
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function normalizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 80 ? name : null;
}

export const CHAIR_ID_RE = /^[A-Z0-9-]{3,32}$/;
