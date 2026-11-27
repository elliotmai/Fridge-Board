/**
 * Phone or tablet. A tablet gets the fridge layouts: the board on one screen,
 * and (on a device that has the board key) opening to Fridge Board and
 * drifting back to it when left alone.
 *
 * A tablet is 760px wide, or at least 500px both ways. So the fridge's Fire HD 8
 * is a tablet either way up (about 854x534 sideways, 534x854 upright), and so is
 * an iPad; a phone is not: it is under 500px wide upright and under 500px tall
 * sideways (sideways and 760px or wider, a phone already got the board on one
 * screen before this rule, and still does).
 *
 * board.css spells the same rule out in its media queries (CSS can't import
 * this); device.test.js checks the two agree.
 */
export const TABLET_QUERY = '(min-width: 760px), (min-width: 500px) and (min-height: 500px)';
export const PHONE_QUERY = '(max-width: 499px), (max-width: 759px) and (max-height: 499px)';

export const isTablet = (width, height) => width >= 760 || (width >= 500 && height >= 500);
