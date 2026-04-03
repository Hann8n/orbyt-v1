/**
 * Session bridge for AtprotoCore — breaks the userStore ↔ core circular dependency.
 * userStore keeps the source of truth; this module mirrors agent + DID for synchronous API reads.
 */
import type { Agent } from '@atproto/api';

let bridgeAgent: Agent | null = null;
let bridgeDid: string | null = null;

export function setAtprotoSession(agent: Agent | null | undefined, did: string | null): void {
  bridgeAgent = agent ?? null;
  bridgeDid = did;
}

export function getAtprotoBridge(): { agent: Agent | null; did: string | null } {
  return { agent: bridgeAgent, did: bridgeDid };
}
