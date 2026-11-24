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
  search: true,
  inside: true, // open apps inside Hive (false: every app in its own tab)
  external: {}, // app id → true: its own tab; false: inside Hive (see opensInTab)
};

/**
 * Wallpapers. `dark` means light text reads better on it (labels turn white).
 * `photo` is the person's own picture, stored separately (it's big).
 */
const honeycomb = (stroke, opacity) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'%3E%3Cpath d='M28 0l28 16v32L28 64 0 48V16zM28 64l28 16v32L28 128 0 112V80z' fill='none' stroke='%23${stroke}' stroke-opacity='${opacity}' stroke-width='1.4'/%3E%3C/svg%3E")`;
// Flat painted colours, like a wall or a barn door. Keys stay the same so
// saved choices carry over; only the paint changed.
export const WALLPAPERS = {
  honey: { name: 'Limewash', css: 'var(--bg)' },
  comb: { name: 'Honeycomb', css: `${honeycomb('8a5a00', '.16')}, #efe6cf` },
  meadow: { name: 'Pasture', css: '#cfdcc4' },
  sand: { name: 'Oat', css: '#e6dccb' },
  ocean: { name: 'Pond', dark: true, css: '#1e4652' },
  barn: { name: 'Barn', dark: true, css: '#6e2a22' },
  dusk: { name: 'Slate', dark: true, css: '#36414c' },
  night: { name: 'Night', dark: true, css: `${honeycomb('ffffff', '.05')}, #131a20` },
  plain: { name: 'Plain', css: 'var(--surface)' },
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

/** One grid row: the icon, its label (if shown, it grows with the icon), and the gap. */
export const rowPx = (icon, look) => icon + (look.labels ? Math.round(icon * 0.3) + 4 : 8) + 8;

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
    for (let i = 0; i < px.length; i += 4 * 97) { sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; n++; }
    return { dataUrl: c.toDataURL('image/jpeg', 0.82), dark: sum / n < 140 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
