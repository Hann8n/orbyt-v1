import { AtUri } from '@atproto/syntax';

/**
 * Validates if a string is a valid AT URI (at://...)
 * @param uri - The string to validate
 * @returns true if valid AT URI, false otherwise
 */
export function isValidAtUri(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new AtUri(uri);
    return parsed.protocol === 'at:';
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid DID (did:...)
 * @param did - The string to validate
 * @returns true if valid DID, false otherwise
 */
export function isValidDid(did: string | null | undefined): boolean {
  if (!did || typeof did !== 'string') return false;
  // Basic DID validation: starts with 'did:' and has at least one method separator
  return did.startsWith('did:') && did.includes(':');
}

/**
 * Validates if a string is a valid AT URI or DID
 * @param identifier - The string to validate
 * @returns true if valid AT URI or DID, false otherwise
 */
export function isValidAtUriOrDid(identifier: string | null | undefined): boolean {
  return isValidAtUri(identifier) || isValidDid(identifier);
}
