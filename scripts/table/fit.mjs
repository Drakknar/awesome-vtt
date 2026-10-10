/**
 * Share one edge of the table between the pills on it.
 *
 * Each pill is centred on its seat's fixed anchor and asks for the width it needs to show its buttons with labels.
 * If every pill fits at that width, extending into free space (empty seats) where needed, each gets it. Otherwise
 * one common cap is applied: pills needing more than the cap are all narrowed to the same width (and may hide their
 * labels), while pills that need less keep their own width. The cap is the largest one at which the edge fits.
 *
 * @param {{center: number, need: number}[]} pills  Pills on one edge, in any order (px along the edge).
 * @param {object} limits
 * @param {number} limits.start  Lowest coordinate a pill may reach (e.g. room kept for a corner pill).
 * @param {number} limits.end    Highest coordinate a pill may reach.
 * @param {number} [limits.gap]  Space kept between two pills.
 * @returns {number[]}           Width per pill, in the order given.
 */
export function allocateEdge(pills, { start, end, gap = 0 }) {
  const needs = pills.map(p => Math.max(0, p.need));
  const order = pills.map((p, i) => i).sort((a, b) => pills[a].center - pills[b].center);

  /** Do all pills fit when none is wider than `cap`? */
  const fits = cap => {
    const w = needs.map(n => Math.min(n, cap));
    for ( const i of order ) {
      const { center } = pills[i];
      // A centred pill reaches half its width to each side.
      if ( (w[i] / 2 > center - start) || (w[i] / 2 > end - center) ) return false;
    }
    for ( let k = 0; k < order.length - 1; k++ ) {
      const a = order[k];
      const b = order[k + 1];
      if ( ((w[a] + w[b]) / 2) > (pills[b].center - pills[a].center - gap) ) return false;
    }
    return true;
  };

  const widest = Math.max(0, ...needs);
  if ( fits(widest) ) return needs.map(n => Math.floor(n));

  // Largest common cap that fits. Rounded to the nearest pixel when that still fits, else down.
  let low = 0;
  let high = widest;
  while ( high - low > 0.001 ) {
    const mid = (low + high) / 2;
    if ( fits(mid) ) low = mid;
    else high = mid;
  }
  const cap = fits(Math.round(low)) ? Math.round(low) : Math.floor(low);
  return needs.map(n => Math.floor(Math.min(n, cap)));
}
