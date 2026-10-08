/**
 * The upload stall limit applies while bytes are going out; once every byte is
 * sent, waiting on the server's answer is not a stall.
 */
import { uploadWatchdogMs } from '@/utils/video/uploadWatchdog';

describe('uploadWatchdogMs', () => {
  it('uses the stall limit while bytes are still going out', () => {
    expect(uploadWatchdogMs(0, 1000)).toBe(60_000);
    expect(uploadWatchdogMs(999, 1000)).toBe(60_000);
  });

  it('waits far longer for the response once every byte is sent', () => {
    expect(uploadWatchdogMs(1000, 1000)).toBeGreaterThan(60_000);
  });

  it('treats an unknown size as still sending', () => {
    expect(uploadWatchdogMs(5000, 0)).toBe(60_000);
  });
});
