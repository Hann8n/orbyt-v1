/**
 * Resolve a DID's PDS via PLC and build an unauthenticated agent for cross-PDS repo reads.
 * Leaf module: no imports from AtprotoService (avoids cycles with RepoService / VideoService).
 */

import { AtpAgent } from '@atproto/api';

const pdsEndpointCache = new Map<string, string>();

export async function resolvePdsEndpointForDid(did: string): Promise<string | null> {
  try {
    if (!did) return null;
    const cached = pdsEndpointCache.get(did);
    if (cached) return cached;

    const url = `https://plc.directory/${encodeURIComponent(did)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = await res.json();
    const services = Array.isArray(doc?.service) ? doc.service : [];
    const pds = services.find(
      (s: { type?: string; id?: string; serviceEndpoint?: string }) =>
        (typeof s?.type === 'string' && s.type.includes('AtprotoPersonalDataServer')) ||
        (typeof s?.id === 'string' && s.id.includes('atproto_pds'))
    ) as { serviceEndpoint?: string } | undefined;
    const endpoint = pds?.serviceEndpoint || null;
    if (endpoint) {
      pdsEndpointCache.set(did, endpoint);
    }
    return endpoint;
  } catch {
    return null;
  }
}

/** Unauthenticated agent targeting the repo's PDS for cross-PDS reads (e.g. getRecord on another DID). */
export async function getAgentForRepo(did: string): Promise<AtpAgent | null> {
  const endpoint = await resolvePdsEndpointForDid(did);
  if (!endpoint) return null;
  try {
    return new AtpAgent({ service: endpoint });
  } catch {
    return null;
  }
}
