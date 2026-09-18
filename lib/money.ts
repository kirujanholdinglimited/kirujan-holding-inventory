/**
 * Round a JS number to exactly 2 decimal places for storing/summing money.
 *
 * Plain JS arithmetic on decimal amounts (e.g. unit cost minus a percentage
 * discount, or several already-rounded figures added together) routinely
 * lands a fraction of a penny off a clean value - either genuine sub-penny
 * fractions from percentage math, or IEEE-754 floating-point noise from
 * addition (0.1 + 0.2 !== 0.3). Every money value must be rounded through
 * this before it's stored or summed, so that dirty values never make it
 * into the database and so that anything summing many rows agrees with
 * anything else summing the same rows.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
