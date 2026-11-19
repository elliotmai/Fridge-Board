/**
 * How the home screen looks: wallpaper, icon size, grid density, and which
 * parts show. Saved per device (hive.look). Everything here is a choice the
 * person makes in Settings → Wallpaper & Home Screen.
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
  external: {}, // app id → true: that app opens in its own tab
};

/**
 * Wallpapers. `dark` means light text reads better on it (labels turn white).
 * `photo` is the person's own picture, stored separately (it's big).
 */
const honeycomb = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'%3E%3Cpath d='M28 0l28 16v32L28 64 0 48V16zM28 64l28 16v32L28 128 0 112V80z' fill='none' stroke='%23b77a0c' stroke-opacity='.13' stroke-width='1.4'/%3E%3C/svg%3E")`;
export const WALLPAPERS = {
  honey: {
    name: 'Honey',
    css: 'radial-gradient(120% 60% at 15% 0%, color-mix(in srgb, var(--honey) 16%, transparent), transparent 60%), radial-gradient(90% 50% at 100% 100%, color-mix(in srgb, var(--ahead) 12%, transparent), transparent 60%), var(--bg)',
  },
  comb: { name: 'Honeycomb', css: `${honeycomb}, linear-gradient(170deg, #fbf3df, #f1dcae)` },
  meadow: { name: 'Meadow', css: 'linear-gradient(170deg, #e4f1dc 0%, #a9cf9c 55%, #5f9e6e 100%)' },
  dusk: { name: 'Dusk', dark: true, css: 'linear-gradient(165deg, #241a46 0%, #7a3d6e 48%, #e0835f 100%)' },
  ocean: { name: 'Ocean', dark: true, css: 'linear-gradient(160deg, #0d2740 0%, #1b6b94 55%, #6fc8c0 100%)' },
  sand: { name: 'Sand', css: 'linear-gradient(160deg, #f6eee3 0%, #e3c9a6 100%)' },
  night: { name: 'Night', dark: true, css: 'radial-gradient(120% 80% at 50% 0%, #26324a 0%, #0b0f17 70%)' },
  barn: { name: 'Barn', dark: true, css: 'linear-gradient(170deg, #5b1f1a 0%, #8f3a2b 50%, #c9763f 100%)' },
  plain: { name: 'Plain', css: 'var(--bg)' },
};

export const ICON_PX = { s: 52, m: 60, l: 70 };

/** Columns for this width: the person's choice, or a phone-like 4 up to 8 on a wide tablet. */
export function columnsFor(width, look) {
  if (look.cols !== 'auto') return Number(look.cols);
  const per = { s: 84, m: 96, l: 112 }[look.iconSize] || 96;
  return Math.max(4, Math.min(8, Math.floor(width / per)));
}

/** Icon size for this width: a little bigger on tablets. */
export const iconPx = (width, look) => ICON_PX[look.iconSize] + (width >= 760 ? 8 : 0);

/** One grid row: the icon, its label (if shown), and the gap. */
export const rowPx = (icon, look) => icon + (look.labels ? 22 : 8) + 8;

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
