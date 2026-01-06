/**
 * Number Formatting Utilities
 */

// Universal number formatting utility for truncating large numbers (e.g., 1.2K, 10K, etc)
export function formatNumber(num: number): string {
  if (num >= 100000) {
    return `${Math.floor(num / 1000)}K`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
