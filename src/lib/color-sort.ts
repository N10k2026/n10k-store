/**
 * Sort colors by temperature: warm → cool.
 *
 * Warm colors (reds, oranges, yellows) come first, cool colors
 * (blues, greens, purples) come last. This is used by the ProductDetail
 * to display color swatches in a visually pleasing warm-to-cool order.
 *
 * The sorting is based on the HSV hue wheel:
 *   Red (0°) → Orange (30°) → Yellow (60°) → Green (120°) →
 *   Cyan (180°) → Blue (240°) → Purple (280°) → Magenta (320°) → Red (360°)
 *
 * We remap hues so that warm colors get low sort values and cool colors
 * get high sort values:
 *   Red/Orange/Yellow (0-60°) → sort 0-60
 *   Magenta/Red (300-360°) → sort 70-100 (warm-ish)
 *   Green (60-180°) → sort 100-180
 *   Blue/Cyan/Purple (180-300°) → sort 180-300
 */

interface ColorWithHex {
  name: string;
  hex: string;
}

/** Convert hex (#RRGGBB) to {r, g, b} (0-255). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return { r, g, b };
}

/** Convert RGB to HSV. Returns {h (0-360), s (0-1), v (0-1)}. */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  if (diff === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / diff) % 6;
  } else if (max === g) {
    h = (b - r) / diff + 2;
  } else {
    h = (r - g) / diff + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : diff / max;
  const v = max;
  return { h, s, v };
}

/**
 * Get a "warmth" sort key for a hex color. Lower = warmer, higher = cooler.
 *
 * Warm: red, orange, yellow, magenta (hues 0-60 and 300-360)
 * Cool: green, cyan, blue, purple (hues 60-300)
 *
 * We also factor in value (darkness) as a secondary sort so that
 * black/white/gray neutrals sort consistently (blacks first among neutrals,
 * whites last).
 */
function getWarmthSortKey(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, v } = rgbToHsv(r, g, b);

  // Low saturation (grays/neutrals): sort by value, put after warm before cool
  if (s < 0.15) {
    // Neutrals: black (v≈0) first, white (v≈1) last
    return 100 + v * 10; // 100-110 range
  }

  // Remap hue for warm-to-cool ordering:
  // 0-60 (red/orange/yellow) → 0-60 (warmest)
  // 300-360 (magenta/pink/red) → 61-100 (warm)
  // 60-180 (green/lime/olive) → 101-150 (neutral-cool)
  // 180-300 (cyan/blue/purple) → 151-250 (coolest)
  if (h <= 60) {
    return h; // 0-60: warmest
  } else if (h >= 300) {
    return 61 + ((h - 300) / 60) * 39; // 61-100: warm
  } else if (h <= 180) {
    return 101 + ((h - 60) / 120) * 49; // 101-150: green
  } else {
    return 151 + ((h - 180) / 120) * 99; // 151-250: blue/purple
  }
}

/**
 * Sort an array of colors by warmth (warm → cool).
 * Returns a new array; does not mutate the original.
 */
export function sortColorsByWarmth<T extends ColorWithHex>(colors: T[]): T[] {
  return [...colors].sort((a, b) => {
    const keyA = getWarmthSortKey(a.hex);
    const keyB = getWarmthSortKey(b.hex);
    return keyA - keyB;
  });
}
