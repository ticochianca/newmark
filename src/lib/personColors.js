/**
 * Deterministic color palette for people.
 * Given a name or initials string, always returns the same color.
 * Colors are curated to be visually distinct and pleasant on both light backgrounds (cards)
 * and as border accents.
 */

const PALETTE = [
  { bg: '#ede9fe', border: '#7c3aed', text: '#4c1d95' }, // purple
  { bg: '#fce7f3', border: '#db2777', text: '#831843' }, // pink
  { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' }, // blue
  { bg: '#d1fae5', border: '#059669', text: '#064e3b' }, // green
  { bg: '#fef3c7', border: '#d97706', text: '#78350f' }, // amber
  { bg: '#fee2e2', border: '#dc2626', text: '#7f1d1d' }, // red
  { bg: '#cffafe', border: '#0891b2', text: '#164e63' }, // cyan
  { bg: '#f0fdf4', border: '#16a34a', text: '#14532d' }, // emerald
  { bg: '#fdf4ff', border: '#a21caf', text: '#581c87' }, // fuchsia
  { bg: '#fff7ed', border: '#ea580c', text: '#7c2d12' }, // orange
];

/**
 * Simple string hash -> palette index.
 * @param {string} str - any string (name, initials, id...)
 * @returns {{ bg, border, text }} color tokens
 */
export function getPersonColor(str) {
  if (!str) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit int
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
