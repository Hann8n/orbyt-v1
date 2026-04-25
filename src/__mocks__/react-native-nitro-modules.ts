function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function toHex(r: number, g: number, b: number): string {
  const ri = Math.round(Math.min(255, Math.max(0, r * 255)));
  const gi = Math.round(Math.min(255, Math.max(0, g * 255)));
  const bi = Math.round(Math.min(255, Math.max(0, b * 255)));
  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
}

const nitroColorsMock = {
  hexToRGBA: (hex: string, alpha: number) => {
    const [r, g, b] = parseHex(hex);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
  },
  blendColors: (hex1: string, hex2: string, ratio: number) => {
    const [r1, g1, b1] = parseHex(hex1);
    const [r2, g2, b2] = parseHex(hex2);
    const t = Math.min(1, Math.max(0, ratio));
    return toHex(r1 * (1 - t) + r2 * t, g1 * (1 - t) + g2 * t, b1 * (1 - t) + b2 * t);
  },
  isColorDark: (hex: string) => {
    const [r, g, b] = parseHex(hex);
    return ((r * 299 + g * 587 + b * 114) * 255) / 1000 < 128;
  },
  darkenColor: (hex: string, amount: number) => {
    const [r, g, b] = parseHex(hex);
    const t = Math.min(1, Math.max(0, amount));
    return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
  },
  getRelativeLuminance: (hex: string) => {
    const [r, g, b] = parseHex(hex);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  },
  getContrastRatio: (hex1: string, hex2: string) => {
    const lum = (hex: string) => {
      const [r, g, b] = parseHex(hex);
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const l1 = lum(hex1),
      l2 = lum(hex2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  },
  enhanceColorSaturation: (hex: string, saturationBoost: number) => {
    const [r, g, b] = parseHex(hex);
    const cmax = Math.max(r, g, b),
      cmin = Math.min(r, g, b);
    const delta = cmax - cmin,
      l = (cmax + cmin) / 2;
    if (delta === 0) return hex;
    let h = 0;
    if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (((h / 6) % 1) + 1) % 1;
    const s = Math.min(
      1,
      (l > 0.5 ? delta / (2 - cmax - cmin) : delta / (cmax + cmin)) * saturationBoost
    );
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    return toHex(hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3));
  },
};

export const NitroModules = {
  createHybridObject: () => nitroColorsMock,
};
