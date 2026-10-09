// Generates src/styles/light-theme.css: light-mode colors for the app.
//
// The app's components hard-code dark colors (bg-[#1E1E1E], text-white,
// text-gray-400…). Rather than rewrite them, this scans src/ for every color
// class and writes a light counterpart that applies under <html class="light">.
// Dark mode is untouched. Run it after adding new colors (it also runs before
// dev and build):
//
//   node scripts/build-light-theme.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tailwindColors = createRequire(import.meta.url)('tailwindcss/colors');
const SRC = join(root, 'src');
const OUT = join(SRC, 'styles', 'light-theme.css');

// ---------- colors ----------

const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

// Surfaces from deepest to most raised. Dark mode gets lighter as things
// rise; light mode keeps the page grey and panels white.
const LIGHT_BG = [
  [0.045, '#F4F5F7'], // page (#0A0A0A)
  [0.11, '#FFFFFF'], // panels and cards (#121212, #1A1A1A)
  [0.14, '#F7F8FA'], // cards on panels, hover (#1E1E1E, #22272D)
  [0.18, '#F1F2F4'], // raised (#252525, #2A2A2A)
  [0.23, '#E8EAED'], // chips, inputs, hover (#333333)
  [0.3, '#DDE0E4'], // (#404040)
  [0.45, '#C9CDD3'], // (#555555)
];
const LIGHT_LINE = [
  [0.12, '#EEF0F2'],
  [0.18, '#E9EBEE'],
  [0.23, '#E2E5E9'], // the common #333333 border
  [0.3, '#D5D9DE'],
  [0.45, '#C3C8CF'],
];
const pick = (table, l) => (table.find(([max]) => l <= max) ?? [0, null])[1];

/** The light-mode color for a dark-mode color in a role, or null to keep it. */
function lightColor(hex, role) {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb);
  const surface = l < 0.32 && (s < 0.45 || l < 0.12);
  if (s < 0.15 || surface) {
    // Greys and the near-black tinted surfaces.
    if (role === 'text') return l > 0.85 ? '#111827' : hslToHex(h, Math.min(s, 0.15), Math.max(0.12, 1 - l));
    if (l > 0.85) return null; // already light: white chips and switches
    if (role === 'line') return pick(LIGHT_LINE, l) ?? hslToHex(h, s, 1 - l);
    if (s >= 0.45 && l < 0.12) return hslToHex(h, Math.min(s, 0.6), 0.94); // dark tinted panel → light tint
    return pick(LIGHT_BG, l) ?? hslToHex(h, s, 1 - l);
  }
  // Accent colors keep their color; light ones get darker when used as text.
  if (role === 'text' && l > 0.55) return hslToHex(h, Math.min(s, 0.9), 0.36);
  return null;
}

const NAMED = {
  white: '#FFFFFF', black: '#000000',
  'gray-100': '#F3F4F6', 'gray-200': '#E5E7EB', 'gray-300': '#D1D5DB', 'gray-400': '#9CA3AF',
  'gray-500': '#6B7280', 'gray-600': '#4B5563', 'gray-700': '#374151', 'gray-800': '#1F2937', 'gray-900': '#111827',
};
// Tailwind's own classes that the dark UI uses. Light-only classes such as
// bg-white or text-gray-900 belong to pages that are light already and are
// left alone.
const NAMED_LIGHT = {
  text: { white: '#111827', 'gray-100': '#111827', 'gray-200': '#1F2937', 'gray-300': '#374151', 'gray-400': '#4B5563', 'gray-500': '#6B7280', 'gray-600': '#9CA3AF' },
  bg: { black: '#F4F5F7', 'gray-900': '#FFFFFF', 'gray-800': '#F3F4F6', 'gray-700': '#E5E7EB', 'gray-600': '#D1D5DB' },
  line: { 'gray-900': '#EEF0F2', 'gray-800': '#E5E7EB', 'gray-700': '#E5E7EB', 'gray-600': '#D1D5DB' },
};
// Bright accent text (text-green-400) is made for black; on white it uses the
// same color's darker shade.
const ACCENTS = ['red', 'green', 'emerald', 'amber', 'yellow', 'blue', 'sky', 'violet', 'purple', 'rose', 'orange', 'teal', 'cyan', 'indigo', 'pink', 'lime'];
for (const color of ACCENTS) {
  for (const shade of [200, 300, 400]) NAMED_LIGHT.text[`${color}-${shade}`] = tailwindColors[color][color === 'yellow' || color === 'amber' ? 800 : 700];
}

// White overlays on dark become black overlays on light.
const WHITE_ALPHA_LIGHT = { bg: (a) => `rgba(0, 0, 0, ${(a * 0.5).toFixed(3)})`, line: (a) => `rgba(0, 0, 0, ${Math.max(a, 0.08).toFixed(3)})`, text: (a) => `rgba(17, 24, 39, ${a})` };

const withAlpha = (hex, alpha) => {
  if (alpha === undefined) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ---------- classes ----------

const UTILITIES = {
  bg: ['bg', ['background-color']],
  text: ['text', ['color']],
  placeholder: ['text', ['color'], '::placeholder'],
  border: ['line', ['border-color']],
  'border-t': ['line', ['border-top-color']],
  'border-b': ['line', ['border-bottom-color']],
  'border-l': ['line', ['border-left-color']],
  'border-r': ['line', ['border-right-color']],
  'border-x': ['line', ['border-left-color', 'border-right-color']],
  'border-y': ['line', ['border-top-color', 'border-bottom-color']],
  divide: ['line', ['border-color'], ' > :not([hidden]) ~ :not([hidden])'],
  ring: ['line', ['--tw-ring-color']],
  outline: ['line', ['outline-color']],
  fill: ['text', ['fill']],
  stroke: ['text', ['stroke']],
  caret: ['text', ['caret-color']],
};
const PSEUDO = {
  hover: ':hover', focus: ':focus', 'focus-within': ':focus-within', 'focus-visible': ':focus-visible',
  active: ':active', disabled: ':disabled', first: ':first-child', last: ':last-child', odd: ':nth-child(odd)', even: ':nth-child(even)',
};
const SCREENS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

const escapeClass = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);

const CLASS_RE = /(?<![\w-])((?:[a-z0-9-]+:)*)((?:bg|text|placeholder|border(?:-[tblrxy])?|divide|ring|outline|fill|stroke|caret)-(?:\[#[0-9A-Fa-f]{3,8}\]|white|black|gray-[1-9]00|[a-z]+-[2-4]00)(?:\/\d{1,3})?)(?![\w\]-])/g;

function lightDeclaration(utility) {
  const m = utility.match(/^([a-z-]+?)-(\[#([0-9A-Fa-f]{3,8})\]|white|black|gray-[1-9]00|[a-z]+-[2-4]00)(?:\/(\d{1,3}))?$/);
  if (!m) return null;
  const [, name, value, hex, opacity] = m;
  const spec = UTILITIES[name];
  if (!spec) return null;
  const [role, props, suffix = ''] = spec;
  const alpha = opacity === undefined ? undefined : Number(opacity) / 100;
  let color;
  if (hex) {
    if (hex.length === 8) return null;
    const light = lightColor('#' + hex, role);
    if (!light) return null;
    color = withAlpha(light, alpha);
  } else if (value === 'white' && alpha !== undefined) {
    color = WHITE_ALPHA_LIGHT[role](alpha);
  } else {
    const light = NAMED_LIGHT[role]?.[value];
    if (!light) return null;
    color = withAlpha(light, alpha);
  }
  return { props, suffix, color };
}

function ruleFor(variants, utility) {
  const decl = lightDeclaration(utility);
  if (!decl) return null;
  let pseudo = '';
  let parent = '';
  let media = null;
  for (const v of variants) {
    if (PSEUDO[v]) pseudo += PSEUDO[v];
    else if (v === 'group-hover') parent = '.group:hover ';
    else if (v === 'placeholder') pseudo += '::placeholder';
    else if (SCREENS[v]) media = SCREENS[v];
    else return null; // dark:, peer-…, and other variants are left alone
  }
  const cls = escapeClass([...variants, utility].join(':'));
  const selector = `html.light ${parent}.${cls}${pseudo}${decl.suffix}`;
  const body = decl.props.map((p) => `${p}: ${decl.color}`).join('; ');
  return { media, css: `${selector} { ${body}; }` };
}

// ---------- scan ----------

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') yield* files(path);
    } else if (/\.(tsx?|jsx?)$/.test(name)) yield path;
  }
}

const found = new Set();
for (const file of files(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(CLASS_RE)) found.add(m[1] + m[2]);
}

const plain = [];
const byScreen = {};
for (const cls of [...found].sort()) {
  const parts = cls.split(':');
  const rule = ruleFor(parts.slice(0, -1), parts.at(-1));
  if (!rule) continue;
  if (rule.media) (byScreen[rule.media] ??= []).push(rule.css);
  else plain.push(rule.css);
}

// White text on a colored button or badge stays white.
const COLORED = [...found]
  .filter((cls) => /^bg-\[#[0-9A-Fa-f]{6}\]$/.test(cls))
  .filter((cls) => {
    const [, s, l] = rgbToHsl(hexToRgb(cls.slice(4, -1)));
    return s >= 0.3 && l >= 0.18 && l <= 0.62;
  })
  .map((cls) => '.' + escapeClass(cls))
  .concat(
    ['blue', 'green', 'red', 'emerald', 'purple', 'indigo', 'violet', 'rose', 'pink', 'sky', 'teal', 'cyan', 'orange']
      .flatMap((c) => [500, 600, 700, 800].map((n) => `.bg-${c}-${n}`)),
  );
const keepWhite = `:is(${COLORED.join(', ')})`;

const out = [
  '/* Generated by scripts/build-light-theme.mjs. Do not edit by hand. */',
  '',
  ...plain,
  ...Object.keys(byScreen)
    .sort((a, b) => a - b)
    .map((w) => `@media (min-width: ${w}px) {\n${byScreen[w].map((r) => '  ' + r).join('\n')}\n}`),
  '',
  `html.light ${keepWhite}[class*="text-white"], html.light ${keepWhite} [class*="text-white"] { color: #FFFFFF !important; }`,
  '',
].join('\n');

writeFileSync(OUT, out);
console.log(`light theme: ${plain.length + Object.values(byScreen).flat().length} rules → ${OUT.slice(root.length + 1)}`);
