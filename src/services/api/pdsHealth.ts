/**
 * Unauthenticated PDS reachability check (com.atproto.server.describeServer).
 */
export async function checkPdsActive(
  pdsInput: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = (pdsInput.trim() || '').toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'Please enter a server address' };
    }
    const base =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    const url = `${base.replace(/\/+$/, '')}/xrpc/com.atproto.server.describeServer`;

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 10000);

    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, { method: 'GET', signal: timeoutController.signal });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return { success: false, error: 'Could not connect' };
      }
      const cause = fetchError instanceof Error && 'cause' in fetchError ? fetchError.cause : null;
      const causeMsg = cause instanceof Error ? cause.message : String(cause || '');
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const combinedMsg = `${errorMsg} ${causeMsg}`.toLowerCase();

      if (combinedMsg.includes('enotfound') || combinedMsg.includes('getaddrinfo')) {
        return { success: false, error: 'Could not connect' };
      }
      if (combinedMsg.includes('econnrefused') || combinedMsg.includes('refused')) {
        return { success: false, error: 'Could not connect' };
      }
      return { success: false, error: 'Could not connect' };
    }

    if (!res.ok) {
      return { success: false, error: 'Could not connect' };
    }

    const data = (await res.json()) as { did?: string; availableUserDomains?: string[] };
    const isValid = typeof data?.did === 'string' || Array.isArray(data?.availableUserDomains);

    if (!isValid) {
      return { success: false, error: 'Could not connect' };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Could not connect' };
    }
    return { success: false, error: 'Could not connect' };
  }
}
