import type { Label } from '@atproto/api/dist/client/types/com/atproto/label/defs';

/**
 * True when the account self-declared the global `bot` label on its profile (AT Protocol self-label).
 * Only labels created by the account (src === did) count; negated labels are ignored.
 */
export function profileHasBotSelfLabel(
  did: string | undefined | null,
  labels: Label[] | undefined | null
): boolean {
  if (!did || !labels?.length) return false;
  return labels.some(l => l.val === 'bot' && l.src === did && !l.neg);
}
