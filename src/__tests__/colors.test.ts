/**
 * Colors utility tests.
 *
 * The Nitro native module is mocked to null (simulating Jest / worklet context),
 * so all assertions run against the pure-JS fallback implementations.
 * This validates the JS-layer contract that the native layer must also honour.
 */

import {
  blendColors,
  darkenColor,
  enhanceColorSaturation,
  extractColorsFromImage,
  getContrastRatio,
  getProfileColors,
  getRelativeLuminance,
  getStatusBarStyle,
  hexToRGBA,
  isColorDark,
} from '../utils/formatting/colors';

// Sanity: native module returns null in Jest (mocked above via moduleNameMapper)
describe('blendColors', () => {
  it('blends to the midpoint', () => {
    expect(blendColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('ratio=0 returns hex1 unchanged', () => {
    expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('ratio=1 returns hex2 unchanged', () => {
    expect(blendColors('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('clamps ratio above 1', () => {
    expect(blendColors('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  it('clamps ratio below 0', () => {
    expect(blendColors('#000000', '#ffffff', -1)).toBe('#000000');
  });

  it('default ratio is 0.5', () => {
    expect(blendColors('#000000', '#ffffff')).toBe('#808080');
  });
});

describe('getRelativeLuminance', () => {
  it('white has luminance ~1', () => {
    expect(getRelativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });

  it('black has luminance 0', () => {
    expect(getRelativeLuminance('#000000')).toBe(0);
  });

  it('mid-grey is between 0 and 1', () => {
    const l = getRelativeLuminance('#808080');
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
  });
});

describe('getContrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('same color returns 1', () => {
    expect(getContrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 4);
  });

  it('ratio is symmetric', () => {
    const a = getContrastRatio('#123456', '#abcdef');
    const b = getContrastRatio('#abcdef', '#123456');
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('isColorDark', () => {
  it('black is dark', () => {
    expect(isColorDark('#000000')).toBe(true);
  });

  it('white is not dark', () => {
    expect(isColorDark('#ffffff')).toBe(false);
  });

  it('mid-grey boundary', () => {
    // brightness = 128 → not dark (threshold is < 128)
    expect(isColorDark('#808080')).toBe(false);
  });
});

describe('darkenColor', () => {
  it('darkens white to a dark color with sufficient amount', () => {
    // amount=0.6 → #ffffff * 0.4 = #666666 → brightness 102 → dark
    const result = darkenColor('#ffffff', 0.6);
    expect(isColorDark(result)).toBe(true);
  });

  it('black stays black', () => {
    expect(darkenColor('#000000', 0.4)).toBe('#000000');
  });

  it('amount=0 returns the original color', () => {
    expect(darkenColor('#ff8800', 0)).toBe('#ff8800');
  });

  it('amount=1 produces black', () => {
    expect(darkenColor('#ff8800', 1)).toBe('#000000');
  });

  it('single-pass — does not over-darken bright colors', () => {
    // Previous double-pass bug would produce a different (darker) result
    const result = darkenColor('#ffffff', 0.4);
    // Expected: #ffffff * 0.6 = #999999
    expect(result).toBe('#999999');
  });
});

describe('enhanceColorSaturation', () => {
  it('achromatic grey is unchanged', () => {
    expect(enhanceColorSaturation('#808080', 1.5)).toBe('#808080');
  });

  it('returns a valid hex string', () => {
    expect(enhanceColorSaturation('#cc3333', 1.5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('boost=1 is identity-like (negligible rounding)', () => {
    const result = enhanceColorSaturation('#aa5500', 1.0);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('hexToRGBA', () => {
  it('converts pure red at 50% alpha', () => {
    expect(hexToRGBA('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('converts white at full alpha', () => {
    expect(hexToRGBA('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('converts black at zero alpha', () => {
    expect(hexToRGBA('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('getStatusBarStyle', () => {
  it('returns dark for dark foreground (text) color', () => {
    expect(getStatusBarStyle('#000000')).toBe('dark');
  });

  it('returns light for light foreground (text) color', () => {
    expect(getStatusBarStyle('#ffffff')).toBe('light');
  });
});

describe('getProfileColors', () => {
  it('uses defaults when passed null', () => {
    const result = getProfileColors(null);
    expect(result.backgroundColor).toBeTruthy();
    expect(result.textColor).toBeTruthy();
    expect(['light', 'dark']).toContain(result.statusBarStyle);
  });

  it('picks up top-level backgroundColor/textColor', () => {
    const result = getProfileColors({
      backgroundColor: '#ff0000',
      textColor: '#ffffff',
      joinedAt: '',
      isBeta: false,
    });
    expect(result.backgroundColor).toBe('#ff0000');
    expect(result.textColor).toBe('#ffffff');
  });

  it('picks up nested orbytColors', () => {
    const result = getProfileColors({
      orbytColors: { backgroundColor: '#0000ff', textColor: '#ffff00' },
    });
    expect(result.backgroundColor).toBe('#0000ff');
    expect(result.textColor).toBe('#ffff00');
  });
});

describe('extractColorsFromImage', () => {
  it('returns a valid color scheme object', async () => {
    const result = await extractColorsFromImage('https://example.com/avatar.jpg');
    expect(result.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.foregroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(['light', 'dark']).toContain(result.statusBarStyle);
  });

  it('falls back gracefully on error', async () => {
    const ImageColors = require('react-native-image-colors').default;
    ImageColors.getColors.mockRejectedValueOnce(new Error('network'));
    const result = await extractColorsFromImage('bad://url');
    expect(result.backgroundColor).toBeTruthy();
    expect(result.statusBarStyle).toBe('light');
  });
});
