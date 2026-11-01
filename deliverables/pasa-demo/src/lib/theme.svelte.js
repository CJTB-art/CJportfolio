// Appearance: light / dark / system, plus an accent colour.
// Both live in their own localStorage keys so the inline script in app.html can restore them BEFORE first paint (no flash).
//   pasa:theme  = 'light' | 'dark' | 'system'
//   pasa:accent = '<id>:<hue>'   e.g. 'tomato:26', 'custom:120'   (tomato = hand-tuned base palette)
//
// Accent colors are derived from one hue in app.css (OKLCH); the paper/chalk neutrals stay stable for readability.
// Tomato is the hand-tuned base palette; other choices set data-accent + --ah on <html>.

const THEME_KEY = 'pasa:theme';
const ACCENT_KEY = 'pasa:accent';
const PAPER_MIGRATION_KEY = 'pasa:paper-migrated';

export const ACCENTS = [
  { id: 'tomato', name: 'Tomato', hue: 26 },
  { id: 'violet', name: 'Violet', hue: 282 },
  { id: 'blue', name: 'Blue', hue: 260 },
  { id: 'teal', name: 'Teal', hue: 185 },
  { id: 'green', name: 'Green', hue: 152 },
  { id: 'orange', name: 'Orange', hue: 50 },
  { id: 'rose', name: 'Rose', hue: 18 },
  { id: 'pink', name: 'Pink', hue: 350 },
  { id: 'magenta', name: 'Magenta', hue: 322 }
];
const DEFAULT_ACCENT = ACCENTS[0];
const MODES = ['light', 'dark', 'system'];

export const theme = $state({
  mode: 'light', // what the person chose (cream is the default)
  dark: false, // what is actually showing (system resolved)
  accent: 'tomato', // a preset id, or 'custom'
  hue: DEFAULT_ACCENT.hue
});

let started = false;
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function save() {
  try {
    localStorage.setItem(THEME_KEY, theme.mode);
    localStorage.setItem(ACCENT_KEY, `${theme.accent}:${theme.hue}`);
  } catch {
    /* storage blocked: the choice lasts for this tab only */
  }
}

// The browser's address-bar / status-bar colour follows the page background.
function syncThemeColor() {
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#010203';
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    if (ctx.fillStyle === '#010203') return; // colour not understood: keep the old one
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    meta.setAttribute('content', '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
  } catch {
    /* cosmetic only */
  }
}

function applyTheme() {
  const root = document.documentElement;
  theme.dark = theme.mode === 'dark' || (theme.mode === 'system' && systemDark());
  root.dataset.theme = theme.dark ? 'dark' : 'light';
  if (theme.accent === 'tomato') {
    delete root.dataset.accent;
    root.style.removeProperty('--ah');
  } else {
    root.dataset.accent = theme.accent;
    root.style.setProperty('--ah', String(theme.hue));
  }
  syncThemeColor();
}

// Call once on the client (layout onMount). app.html has already painted the right colours.
export function loadTheme() {
  try {
    const m = localStorage.getItem(THEME_KEY);
    if (MODES.includes(m)) theme.mode = m;
    let [id, h] = (localStorage.getItem(ACCENT_KEY) ?? '').split(':');
    let hue = Number(h);
    if (localStorage.getItem(PAPER_MIGRATION_KEY) !== '1') {
      // Migrate the pre-paper default once. Afterward, selecting Violet in Appearance remains a real saved choice.
      if (id === 'violet' && (hue === 282 || !h)) {
        id = DEFAULT_ACCENT.id;
        hue = DEFAULT_ACCENT.hue;
        localStorage.setItem(ACCENT_KEY, `${id}:${hue}`);
      }
      localStorage.setItem(PAPER_MIGRATION_KEY, '1');
    }
    // Accent colours are retired: the palette is fixed to the Home look.
    if (false) {
      theme.accent = id;
      theme.hue = hue;
    }
  } catch {
    /* defaults */
  }
  applyTheme();
  if (!started) {
    started = true;
    // "System" follows the device live (e.g. automatic dark at night).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme.mode === 'system' && applyTheme());
  }
}

export function setMode(mode) {
  if (!MODES.includes(mode)) return;
  theme.mode = mode;
  save();
  applyTheme();
}

// The sidebar button: flips what is showing right now (so it also works while on "System").
export function toggleDark() {
  setMode(theme.dark ? 'light' : 'dark');
}

export function setAccent(id) {
  const a = ACCENTS.find((x) => x.id === id);
  if (!a) return;
  theme.accent = a.id;
  theme.hue = a.hue;
  save();
  applyTheme();
}

// Free choice from the hue slider.
export function setHue(hue) {
  theme.accent = 'custom';
  theme.hue = Math.min(360, Math.max(0, Math.round(hue)));
  save();
  applyTheme();
}

// Back to the shipped look: Cream Paper with the tomato accent.
export function resetTheme() {
  theme.mode = 'light';
  theme.accent = 'tomato';
  theme.hue = DEFAULT_ACCENT.hue;
  save();
  try { localStorage.setItem(PAPER_MIGRATION_KEY, '1'); } catch { /* storage blocked */ }
  applyTheme();
}

export const accentName = () => (theme.accent === 'custom' ? 'Custom' : (ACCENTS.find((a) => a.id === theme.accent)?.name ?? 'Tomato'));
