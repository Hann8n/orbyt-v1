const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const getLuminance = (rgb) => {
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const calculateContrast = (color1, color2) => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
};

const white = '#f3f5fe';
const darkText = '#1a1a2e';

// Virginia Tech colors
const chicagoMaroon = '#861F41';
const burntOrange = '#E5751F';
const impactOrange = '#CA4F00';

console.log('Virginia Tech Color Combinations:\n');

// Test maroon as background
console.log('1. Chicago Maroon as background:');
console.log(`   Maroon + White: ${calculateContrast(chicagoMaroon, white).toFixed(2)}:1`);
console.log(`   Maroon + Burnt Orange: ${calculateContrast(chicagoMaroon, burntOrange).toFixed(2)}:1`);
console.log(`   Maroon + Impact Orange: ${calculateContrast(chicagoMaroon, impactOrange).toFixed(2)}:1`);

// Test orange as background
console.log('\n2. Orange as background:');
console.log(`   Burnt Orange + White: ${calculateContrast(burntOrange, white).toFixed(2)}:1`);
console.log(`   Burnt Orange + Dark Text: ${calculateContrast(burntOrange, darkText).toFixed(2)}:1`);
console.log(`   Impact Orange + White: ${calculateContrast(impactOrange, white).toFixed(2)}:1`);
console.log(`   Impact Orange + Dark Text: ${calculateContrast(impactOrange, darkText).toFixed(2)}:1`);

// Test inverted
console.log('\n3. Inverted (orange bg, maroon text):');
console.log(`   Burnt Orange + Maroon: ${calculateContrast(burntOrange, chicagoMaroon).toFixed(2)}:1`);
console.log(`   Impact Orange + Maroon: ${calculateContrast(impactOrange, chicagoMaroon).toFixed(2)}:1`);

// Check what passes
console.log('\n4. WCAG 2.2 AA Compliant (4.5:1):');
const tests = [
  { name: 'Maroon + White', bg: chicagoMaroon, text: white },
  { name: 'Maroon + Burnt Orange', bg: chicagoMaroon, text: burntOrange },
  { name: 'Maroon + Impact Orange', bg: chicagoMaroon, text: impactOrange },
  { name: 'Burnt Orange + White', bg: burntOrange, text: white },
  { name: 'Burnt Orange + Dark Text', bg: burntOrange, text: darkText },
  { name: 'Impact Orange + White', bg: impactOrange, text: white },
  { name: 'Impact Orange + Dark Text', bg: impactOrange, text: darkText },
  { name: 'Burnt Orange + Maroon', bg: burntOrange, text: chicagoMaroon },
  { name: 'Impact Orange + Maroon', bg: impactOrange, text: chicagoMaroon },
];

tests.forEach(test => {
  const ratio = calculateContrast(test.bg, test.text);
  const passes = ratio >= 4.5;
  console.log(`   ${passes ? '✓' : '✗'} ${test.name}: ${ratio.toFixed(2)}:1`);
});
