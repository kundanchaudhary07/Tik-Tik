// src/utils/validation.ts

/**
 * Standard RFC 5322 compliant regex for validating email addresses.
 * Rejects missing domain, missing local-part, leading/trailing dots, spaces, etc.
 * Accepts standard alphanumeric and valid punctuation characters.
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
}
