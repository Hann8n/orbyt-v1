#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const srcDir = path.join(projectRoot, 'src');
const uiModuleAbs = path.join(projectRoot, 'src', 'components', 'ui', 'UI');

// Palette copied from UI.tsx Colors
const palette = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FE4359',
  green: '#00D4AA',
  blue: '#6366F1',
  yellow: '#FFD700',
  purple: '#8B5CF6',
  orange: '#FF6B35',
  gray: '#7C808B',
  lightGray: '#CFD6E8',
  mediumGray: '#53565D',
  darkGray: '#292B2E',
  lightBlue: '#00E5FF',
  darkBlue: '#4C1D95',
  lightGreen: '#00FFA3',
  darkGreen: '#00B894',
  lightRed: '#FF6B9D',
  darkRed: '#DC2626',
  lightYellow: '#FFEB3B',
  darkYellow: '#FF9800',
  neonPink: '#FF0080',
  electricBlue: '#00BFFF',
  vibrantTeal: '#00E6CC',
  glowGreen: '#39FF14',
  cosmicPurple: '#9D4EDD',
  sunsetOrange: '#FF4500',
};

const properties = [
  'color', 'backgroundColor', 'borderColor', 'shadowColor', 'placeholderTextColor', 'tintColor', 'textColor', 'secondaryColor',
  'borderBottomColor', 'borderTopColor', 'borderRightColor', 'borderLeftColor', 'activeColor', 'inactiveColor', 'ringColor',
  'thumbColor', 'ios_backgroundColor', 'trackColor', 'statusBarColor', 'tabBarActiveTintColor', 'tabBarInactiveTintColor'
];

function normalizeHex(hex) {
  let h = hex.trim().replace(/^["']|["']$/g, '').replace('#', '');
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('');
  }
  return '#' + h.toUpperCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorDistanceSq(a, b) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

// Precompute palette RGB
const paletteEntries = Object.entries(palette).map(([name, hex]) => ({ name, hex: normalizeHex(hex), rgb: hexToRgb(hex) }));

function nearestPaletteEntry(hex) {
  const targetRgb = hexToRgb(hex);
  let best = null;
  for (const entry of paletteEntries) {
    const dist = colorDistanceSq(targetRgb, entry.rgb);
    if (!best || dist < best.dist) best = { ...entry, dist };
  }
  return best; // includes name, hex, rgb, dist
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'build', 'dist', '.expo', 'ios-local-artifacts'].includes(entry.name)) continue;
      results.push(...listFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function ensureColorsImport(filePath, source, updated) {
  // Compute relative import path to UI module
  let rel = path.relative(path.dirname(filePath), uiModuleAbs);
  if (!rel.startsWith('.')) rel = './' + rel;
  rel = rel.split(path.sep).join('/');

  const importRe = new RegExp(`from ['"]${rel}['"]`);
  const hasNamedImport = new RegExp(`import\\s*\\{[^}]*\\bColors\\b[^}]*\\}\\s*from\\s*['\"]${rel}['\"]`).test(updated);
  const hasAnyFrom = importRe.test(updated);

  if (hasNamedImport) return updated;

  const importLine = `import { Colors } from '${rel}';\n`;

  if (hasAnyFrom) {
    // Upgrade existing default-only import to include Colors named import
    // This is a simple approach: add a separate named import
    return updated.replace(/(import[^\n]*from ['"][^'"]+UI['"];?\n)/, `$1${importLine}`) || (importLine + updated);
  }

  // Insert after last import
  const lines = updated.split(/\n/);
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) lastImportIdx = i;
  }
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine.trimEnd());
    return lines.join('\n');
  }
  return importLine + updated;
}

function replaceHexesInContent(filePath, content, report) {
  let updated = content;
  let changed = false;

  // Attribute form: propName="#AABBCC"
  const attrPattern = new RegExp(`\\b(${properties.join('|')})\\s*=\\s*"(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))"`, 'g');
  updated = updated.replace(attrPattern, (m, prop, hex) => {
    const norm = normalizeHex(hex);
    const exactEntry = paletteEntries.find(p => p.hex === norm);
    let replacementName;
    if (exactEntry) {
      replacementName = exactEntry.name;
    } else {
      const nearest = nearestPaletteEntry(norm);
      replacementName = nearest.name;
      report.approx.push({ filePath, prop, from: norm, to: nearest.hex, toName: nearest.name, dist: Math.sqrt(nearest.dist) });
    }
    changed = true;
    report.replaced.push({ filePath, prop, from: norm, toName: replacementName });
    return `${prop}={Colors.${replacementName}}`;
  });

  // Style object form: propName: '#AABBCC' or '#ABC'
  const stylePattern = new RegExp(`\\b(${properties.join('|')})\\s*:\\s*[\'\"](#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))[\'\"]`, 'g');
  updated = updated.replace(stylePattern, (m, prop, hex) => {
    const norm = normalizeHex(hex);
    const exactEntry = paletteEntries.find(p => p.hex === norm);
    let replacementName;
    if (exactEntry) {
      replacementName = exactEntry.name;
    } else {
      const nearest = nearestPaletteEntry(norm);
      replacementName = nearest.name;
      report.approx.push({ filePath, prop, from: norm, to: nearest.hex, toName: nearest.name, dist: Math.sqrt(nearest.dist) });
    }
    changed = true;
    report.replaced.push({ filePath, prop, from: norm, toName: replacementName });
    return `${prop}: Colors.${replacementName}`;
  });

  // Generic strings that look like colors but not tied to recognized props are left unchanged

  // JSX attribute with braces containing hex strings, e.g., color={cond ? '#fff' : '#666'}
  const propNamesGroup = properties.join('|');
  const attrInBracesPattern = new RegExp(`\\b(${propNamesGroup})\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'g');
  updated = updated.replace(attrInBracesPattern, (m, prop, inner) => {
    let innerUpdated = inner;
    const hexInString = /(['"])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\1/g;
    let replacedAny = false;
    innerUpdated = innerUpdated.replace(hexInString, (_m, quote, hexBody) => {
      const norm = normalizeHex('#' + hexBody);
      const exactEntry = paletteEntries.find(p => p.hex === norm);
      let replacementName;
      if (exactEntry) {
        replacementName = exactEntry.name;
      } else {
        const nearest = nearestPaletteEntry(norm);
        replacementName = nearest.name;
        report.approx.push({ filePath, prop, from: norm, to: nearest.hex, toName: nearest.name, dist: Math.sqrt(nearest.dist) });
      }
      replacedAny = true;
      report.replaced.push({ filePath, prop, from: norm, toName: replacementName });
      return `Colors.${replacementName}`;
    });

    if (replacedAny) {
      changed = true;
      return `${prop}={${innerUpdated}}`;
    }
    return m;
  });

  // Special handling for trackColor object: trackColor={{ false: '#xxxxxx', true: '#yyyyyy' }}
  updated = updated.replace(/\btrackColor\s*=\s*\{\{([\s\S]*?)\}\}/g, (m, objInner) => {
    let innerUpdated = objInner;
    const hexInString = /(['"])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\1/g;
    let replacedAny = false;
    innerUpdated = innerUpdated.replace(hexInString, (_m, _q, hexBody) => {
      const norm = normalizeHex('#' + hexBody);
      const exactEntry = paletteEntries.find(p => p.hex === norm);
      let replacementName;
      if (exactEntry) {
        replacementName = exactEntry.name;
      } else {
        const nearest = nearestPaletteEntry(norm);
        replacementName = nearest.name;
        report.approx.push({ filePath, prop: 'trackColor', from: norm, to: nearest.hex, toName: nearest.name, dist: Math.sqrt(nearest.dist) });
      }
      replacedAny = true;
      report.replaced.push({ filePath, prop: 'trackColor', from: norm, toName: replacementName });
      return `Colors.${replacementName}`;
    });
    if (replacedAny) {
      changed = true;
      return `trackColor={{${innerUpdated}}}`;
    }
    return m;
  });

  if (changed) {
    updated = ensureColorsImport(filePath, content, updated);
  }

  return { updated, changed };
}

function main() {
  const files = listFiles(srcDir).filter(f => {
    if (/src[\/\\]components[\/\\]ui[\/\\]UI\.(t|j)sx?$/.test(f)) return false;
    if (/src[\/\\]screens[\/\\]ProfileScreen\.(t|j)sx?$/.test(f)) return false; // preserve special color logic
    if (/src[\/\\]screens[\/\\]ChannelScreen\.(t|j)sx?$/.test(f)) return false; // preserve special color logic
    return true;
  });
  const report = { replaced: [], approx: [] };
  let changedFiles = 0;
  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const { updated, changed } = replaceHexesInContent(filePath, original, report);
    if (changed && updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      changedFiles++;
      console.log(`Updated: ${path.relative(projectRoot, filePath)}`);
    }
  }

  console.log(`\nChanged files: ${changedFiles}, total replacements: ${report.replaced.length}`);
  if (report.approx.length) {
    console.log(`\nApproximated mappings (nearest palette color used):`);
    const byColor = new Map();
    for (const r of report.approx) {
      const key = `${r.from}=>${r.toName}`;
      byColor.set(key, (byColor.get(key) || 0) + 1);
    }
    for (const [k, count] of byColor.entries()) {
      console.log(`  ${k} (${count})`);
    }
  }
}

main();


