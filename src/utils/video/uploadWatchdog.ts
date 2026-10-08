/** Abort an upload that has sent no bytes for this long. */
const UPLOAD_STALL_TIMEOUT_MS = 60_000;

/**
 * Once the last byte is sent the server answers only after it has taken the file in, which can
 * outlast the stall limit; that wait is not a stall, so it gets a far longer limit.
 */
const UPLOAD_RESPONSE_TIMEOUT_MS = 10 * 60_000;

/**
 * How long the upload may go without news before it is aborted: the stall limit while bytes
 * are still going out, the response limit once all of them are sent.
 */
export function uploadWatchdogMs(loaded: number, total: number): number {
  return total > 0 && loaded >= total ? UPLOAD_RESPONSE_TIMEOUT_MS : UPLOAD_STALL_TIMEOUT_MS;
}
