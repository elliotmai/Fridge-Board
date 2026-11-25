/**
 * How the home screen looks: wallpaper, icon size, grid density, and which
 * parts show. Saved per device (hive.look). Everything here is a choice the
 * person makes in Settings → Wallpaper & home screen.
 */
export const DEFAULT_LOOK = {
  wallpaper: 'honey',
  dim: false,
  iconSize: 'm', // s | m | l
  labels: true,
  cols: 'auto', // auto | 4 | 5 | 6 | 7 | 8
  dock: true,
  library: true,
  badges: true,
  badgeStyle: 'count', // count | dot
  iconStyle: 'colour', // colour | dark | tinted
  wallColour: true, // Hive's dock, folders and dots take their colour from the wallpaper
  density: 'roomy', // roomy | compact
  glance: true, // the line under the clock
  rest: null, // the clock screen (ClockScreen.jsx DEFAULT_REST until changed)
  search: true,
  inside: true, // open apps inside Hive (false: every app in its own tab)
  external: {}, // app id → true: its own tab; false: inside Hive (see opensInTab)
};

/**
 * Wallpapers. `dark` means light text reads better on it (labels turn white).
 * `accent` is the colour Hive's own chrome takes from it (the dock, folders,
 * page dots, tinted icons), like a phone matching its colours to the
 * wallpaper. `photo` is the person's own picture, stored separately (it's
 * big), with its accent picked out when it was chosen.
 */
const honeycomb = (stroke, opacity) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'%3E%3Cpath d='M28 0l28 16v32L28 64 0 48V16zM28 64l28 16v32L28 128 0 112V80z' fill='none' stroke='%23${stroke}' stroke-opacity='${opacity}' stroke-width='1.4'/%3E%3C/svg%3E")`;
// Flat painted colours, like a wall or a barn door. Keys stay the same so
// saved choices carry over; only the paint changed.
export const WALLPAPERS = {
  honey: { name: 'Limewash', accent: '#8a5a00', css: 'var(--bg)' },
  comb: { name: 'Honeycomb', accent: '#a8741c', css: `${honeycomb('8a5a00', '.16')}, #efe6cf` },
  meadow: { name: 'Pasture', accent: '#4d7a3c', css: '#cfdcc4' },
  sand: { name: 'Oat', accent: '#94703f', css: '#e6dccb' },
  ocean: { name: 'Pond', dark: true, accent: '#4b98aa', css: '#1e4652' },
  barn: { name: 'Barn', dark: true, accent: '#c0604a', css: '#6e2a22' },
  dusk: { name: 'Slate', dark: true, accent: '#7a90a6', css: '#36414c' },
  night: { name: 'Night', dark: true, accent: '#6f8fa8', css: `${honeycomb('ffffff', '.05')}, #131a20` },
  plain: { name: 'Plain', accent: '#8a5a00', css: 'var(--surface)' },
};

export const ICON_PX = { s: 52, m: 60, l: 70 };

/** Columns for this width: the person's choice, or a phone-like 4 up to 8 on a wide tablet. */
export function columnsFor(width, look) {
  if (look.cols !== 'auto') return Number(look.cols);
  const per = ({ s: 84, m: 96, l: 112 }[look.iconSize] || 96) * (width >= 1000 ? 1.3 : 1);
  return Math.max(4, Math.min(8, Math.floor(width / per)));
}

/** Icon size for this width: bigger on tablets, bigger again on a wall display read from across the room. */
export const iconPx = (width, look) => ICON_PX[look.iconSize] + (width >= 1000 ? 28 : width >= 760 ? 8 : 0);

/** One grid row: the icon, its label (if shown, it grows with the icon), and the gap. Compact rows close the gap. */
export const rowPx = (icon, look) => icon + (look.labels ? Math.round(icon * 0.3) + 4 : 8) + (look.density === 'compact' ? 0 : 8) + (look.density === 'compact' ? -Math.round(icon * 0.08) : 0);

/** The colour Hive's chrome takes: from the wallpaper (or photo), or Hive's own honey. */
export function accentFor(look, photo) {
  if (look.wallColour === false) return null;
  if (look.wallpaper === 'photo') return photo?.accent || null;
  return WALLPAPERS[look.wallpaper]?.accent || null;
}

/**
 * Shrink a photo the person picked to a wallpaper-sized JPEG data URL, and
 * work out whether it's dark (so labels can turn white). Big photos would
 * overflow browser storage; this keeps them to a few hundred KB.
 */
export async function photoToWallpaper(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    const hues = new Array(12).fill(null).map(() => ({ n: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < px.length; i += 4 * 97) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++;
      // Bucket the colourful pixels by hue; the biggest bucket is the photo's colour.
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 40 || mx < 50) continue;
      const h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
      const bucket = hues[Math.floor(h * 2) % 12];
      bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
    }
    const top = hues.reduce((a, b) => (b.n > a.n ? b : a));
    const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
    const accent = top.n > 8 ? `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}` : null;
    return { dataUrl: c.toDataURL('image/jpeg', 0.82), dark: sum / n < 140, accent };
  } finally {
    URL.revokeObjectURL(url);
  }
}
