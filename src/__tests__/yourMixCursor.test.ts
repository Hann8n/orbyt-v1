/**
 * Your Mix cursors must match Orbyt iOS and the Byte bridge. The fixture is
 * orbyt-platform `apps/ios/OrbytTests/Fixtures/your-mix.json`, copied verbatim.
 */
import fixture from './fixtures/your-mix.json';
import {
  decodeYourMixCursor,
  nextYourMixCursor,
  type YourMixSource,
} from '@/services/orbyt/yourMixCursor';

interface DecodeCase {
  name: string;
  cursor: string | null;
  source: YourMixSource;
  upstream: string | null;
}

interface NextCase {
  name: string;
  from: { source: YourMixSource; cursor: string | null };
  upstream: string | null;
  cursor: string;
}

describe('Your Mix cursor (shared fixture)', () => {
  it.each((fixture.decode as DecodeCase[]).map(c => [c.name, c] as const))(
    'decode: %s',
    (_name, c) => {
      expect(decodeYourMixCursor(c.cursor)).toEqual({ source: c.source, cursor: c.upstream });
    }
  );

  it.each((fixture.next as NextCase[]).map(c => [c.name, c] as const))('next: %s', (_name, c) => {
    expect(nextYourMixCursor(c.from, c.upstream)).toBe(c.cursor);
  });
});
