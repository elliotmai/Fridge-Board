/* Line glyphs drawn on each app's colour tile. 24×24, white stroke. */
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
const G = (children) => function Glyph() { return <svg viewBox="0 0 24 24" {...s} aria-hidden="true">{children}</svg>; };

export const GLYPHS = {
  board: G(<><rect x="3.5" y="4" width="17" height="14" rx="2.5" /><path d="M9 4v14M14.5 4v14M7 21h10" /></>),
  barn: G(<><path d="M3.5 10.5L12 4l8.5 6.5V20h-17z" /><path d="M9 20v-6h6v6M9 14l6 6M15 14l-6 6" /></>),
  cow: G(<><path d="M6 8.5C4 8.5 3 7 3 5.5c1.6 0 2.6.5 3.3 1.3M18 8.5c2 0 3-1.5 3-3-1.6 0-2.6.5-3.3 1.3" /><path d="M6.5 7.5h11l-.6 8.2a3 3 0 0 1-3 2.8h-3.8a3 3 0 0 1-3-2.8z" /><circle cx="10" cy="15.5" r=".6" fill="currentColor" /><circle cx="14" cy="15.5" r=".6" fill="currentColor" /><path d="M9.5 11h.01M14.5 11h.01" /></>),
  graph: G(<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.8 7.3l2.9 8.8M16.6 8.8l-3.6 7.2M8.2 6.2l7.6.6" /></>),
  pot: G(<><path d="M4 10h16v5.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 15.5z" /><path d="M2.5 10h19M9 6.5c0-1 .8-1.5.8-2.5M13 6.5c0-1 .8-1.5.8-2.5" /></>),
  fork: G(<><path d="M7 3v6a2 2 0 0 0 4 0V3M9 11v10" /><path d="M16.5 21V3c-2 1.5-3 4-3 7 0 1.5 1 2.5 3 2.5" /></>),
  wave: G(<><path d="M3 9c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 14c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" /><path d="M12 3v3" /></>),
  wrench: G(<path d="M14.5 3.5a4.5 4.5 0 0 0-4.3 5.9L3.8 15.8a2 2 0 0 0 2.8 2.8l6.4-6.4a4.5 4.5 0 0 0 5.9-4.3l-2.6 2.6-2.8-.8-.8-2.8z" />),
  moon: G(<><path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z" /><path d="M17 3.5v3M15.5 5h3" /></>),
  plane: G(<path d="M10.5 13.5L3 11l1.5-1.5 7.5 1L16 6.5a2 2 0 0 1 3 3l-4 4 1 7.5L14.5 22 12 14.5l-3 3V20l-1.5 1L6 18 3 16.5 4 15h2.5z" />),
  binoculars: G(<><circle cx="6.5" cy="15.5" r="3.5" /><circle cx="17.5" cy="15.5" r="3.5" /><path d="M10 15.5h4M4 13l2-8h3l1 5M20 13l-2-8h-3l-1 5" /></>),
  leaf: G(<><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19l8-8" /></>),
  book: G(<><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" /></>),
  cup: G(<><path d="M4 8.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 .8 1.5.8 2.5M12 3.5c0 1 .8 1.5.8 2.5" /></>),
  glass: G(<><path d="M6 3.5h12l-1 7a5 5 0 0 1-10 0z" /><path d="M12 15.5V20.5M8 20.5h8M6.6 8h10.8" /></>),
  dice: G(<><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r=".9" fill="currentColor" /><circle cx="15" cy="15" r=".9" fill="currentColor" /><circle cx="15" cy="9" r=".9" fill="currentColor" /><circle cx="9" cy="15" r=".9" fill="currentColor" /><circle cx="12" cy="12" r=".9" fill="currentColor" /></>),
  pulse: G(<><path d="M3 12h4l2.5-6 4 12 2.5-6h5" /></>),
  ticket: G(<><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="1.5 2" /></>),
};

GLYPHS.gear = G(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="6.4" /></>);
GLYPHS.star = G(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z" />);
GLYPHS.heart = G(<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />);
GLYPHS.home = G(<><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>);
GLYPHS.bolt = G(<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />);
GLYPHS.music = G(<><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>);

/** Line icons for Hive's own buttons and menus. */
const L = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const UI = {
  search: () => <svg viewBox="0 0 24 24" {...L}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" {...L}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
  minus: () => <svg viewBox="0 0 24 24" {...L}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" {...L}><path d="M12 5v14M5 12h14" /></svg>,
  grid: () => <svg viewBox="0 0 24 24" {...L}><rect x="4" y="4" width="6" height="6" rx="1.6" /><rect x="14" y="4" width="6" height="6" rx="1.6" /><rect x="4" y="14" width="6" height="6" rx="1.6" /><rect x="14" y="14" width="6" height="6" rx="1.6" /></svg>,
  palette: () => <svg viewBox="0 0 24 24" {...L}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.1a4 4 0 0 0 4-4C20.5 6.6 16.7 3.5 12 3.5z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="14.5" cy="7.5" r="1" /></svg>,
  arrow: () => <svg viewBox="0 0 24 24" {...L}><path d="M7 17L17 7M9 7h8v8" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...L}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  folder: () => <svg viewBox="0 0 24 24" {...L}><path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>,
  size: () => <svg viewBox="0 0 24 24" {...L}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 12h16M12 12v8" /></svg>,
  library: () => <svg viewBox="0 0 24 24" {...L}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><path d="M16.5 13.5v6M13.5 16.5h6" /></svg>,
};

export const Fallback = G(<circle cx="12" cy="12" r="6" />);
