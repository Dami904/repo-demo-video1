// Per-film look. The engine's CSS and JS name their colours and fonts as
// @@slots@@ (e.g. "@@accent@@", "rgba(@@ink.rgb@@,0.2)", "@@font.sans@@");
// the server fills them from the film's theme when it serves the engine.
//
// film.json may carry:
//   "theme": {
//     "colors": { "paper": "#171717", "ink": "#fafafa", "accent": "#3987e5", ... },
//     "fonts": { "sans": "DM Sans", "mono": "Geist Mono", "display": "DM Sans" },
//     "logo": "frontend/public/logo.svg"          (a path in the repository)
//   }
// Any colour left out falls back to DEFAULT_COLORS. Fonts are Google Fonts
// families, downloaded once into videos/<film>/fonts/ by `npm run plan`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { filmDir, readJson } from "./film";

/** A plain light look: warm off-white paper, near-black ink, indigo accent. */
export const DEFAULT_COLORS = {
  paper: "#f6f5f1", // the canvas
  paper2: "#ebe9e2", // the second background glow
  card: "#ffffff", // box, code and table fill
  ink: "#16161a", // text
  ink2: "#55555f", // secondary text
  line: "#16161a", // borders
  shadow: "#16161a", // hard offset shadows
  accent: "#8b93ff", // accent fill (accent boxes, bars)
  accentSoft: "#d9dcff", // soft fill (soft boxes, chips)
  accentDeep: "#4450e6", // accent lines, packets, highlights, progress bar
  ok: "#0f7a48",
  okSoft: "#cff2de",
  bad: "#b3263a",
  badSoft: "#ffd9da",
  glow: "#ffffff", // the soft light in the background
  termBg: "#16161a",
  termText: "#f6f5f1",
  termDim: "#a9a9b8",
  termLine: "#34343f",
  termOk: "#7ee2a8",
  captionBg: "rgba(22,22,26,0.88)",
  captionText: "#ffffff",
  codeString: "#7a4a14",
  codeNumber: "#0d6e7a",
};
export type ThemeColors = typeof DEFAULT_COLORS;

const FONT_ROLES = ["sans", "mono", "display", "displayItalic"] as const;
type FontRole = (typeof FONT_ROLES)[number];

/** The engine's bundled fonts, relative to stage.html. */
const DEFAULT_FONTS: Record<FontRole, string> = {
  sans: "assets/fonts/Geist-Variable.woff2",
  mono: "assets/fonts/GeistMono-Variable.woff2",
  display: "assets/fonts/InstrumentSerif-Regular.woff2",
  displayItalic: "assets/fonts/InstrumentSerif-Italic.woff2",
};

interface FilmTheme {
  colors?: Partial<ThemeColors>;
  fonts?: { sans?: string; mono?: string; display?: string };
  logo?: string;
}

function filmTheme(film: string): FilmTheme {
  const path = join(filmDir(film), "film.json");
  return existsSync(path) ? (readJson(path).theme ?? {}) : {};
}

function rgbOf(color: string): string | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color.trim());
  return rgb ? `${rgb[1]},${rgb[2]},${rgb[3]}` : null;
}

/** Every @@slot@@ value for a film. */
export function themeSlots(film: string): Map<string, string> {
  const theme = filmTheme(film);
  const colors = { ...DEFAULT_COLORS, ...(theme.colors ?? {}) };
  const slots = new Map<string, string>();
  for (const [name, value] of Object.entries(colors)) {
    slots.set(name, value);
    const rgb = rgbOf(value);
    if (rgb) slots.set(`${name}.rgb`, rgb);
  }
  const fontsDir = join(filmDir(film), "fonts");
  const record = join(fontsDir, "families.json");
  // Only fonts the current theme still names (a dropped one falls back).
  const families: Record<string, string> = existsSync(record) ? readJson(record) : {};
  for (const role of FONT_ROLES) {
    const own = Boolean(families[role]) && existsSync(join(fontsDir, `${role}.woff2`));
    slots.set(`font.${role}`, own ? `/videos/${film}/fonts/${role}.woff2` : DEFAULT_FONTS[role]);
  }
  return slots;
}

/** Fill the @@slots@@ in one engine file. */
export function applyTheme(text: string, slots: Map<string, string>): string {
  return text.replace(/@@([\w.]+)@@/g, (whole, name: string) => {
    const value = slots.get(name);
    if (value === undefined) throw new Error(`Unknown theme slot ${whole}`);
    return value;
  });
}

/** The film's logo as served, if film.json names one (copied by prepareTheme). */
export function logoUrl(film: string): string | undefined {
  const logo = filmTheme(film).logo;
  return logo ? `/videos/${film}/logo${extname(logo).toLowerCase()}` : undefined;
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** The latin-subset woff2 URLs Google Fonts serves for a family, by style. */
async function googleFont(family: string): Promise<{ normal?: string; italic?: string }> {
  const name = family.trim().replace(/ /g, "+");
  // Variable weights (and italics) when the family has them, else its defaults.
  const queries = [`${name}:ital,wght@0,100..900;1,100..900`, `${name}:wght@100..900`, `${name}:ital@0;1`, name];
  for (const query of queries) {
    const response = await fetch(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, {
      headers: { "user-agent": CHROME_UA },
    });
    if (!response.ok) continue;
    const css = await response.text();
    const found: { normal?: string; italic?: string } = {};
    for (const block of css.split("/*").slice(1)) {
      if (!block.startsWith(" latin */")) continue;
      const style = /font-style:\s*(\w+)/.exec(block)?.[1];
      const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
      if (url && (style === "normal" || style === "italic")) found[style] ??= url;
    }
    if (found.normal) return found;
  }
  throw new Error(`Google Fonts has no family "${family}"`);
}

/** Copy the logo and download the theme's fonts into the film folder. */
export async function prepareTheme(film: string, source: string): Promise<void> {
  const theme = filmTheme(film);
  const dir = filmDir(film);
  if (theme.logo) {
    copyFileSync(join(source, theme.logo), join(dir, `logo${extname(theme.logo).toLowerCase()}`));
  }
  const fonts = theme.fonts ?? {};
  const fontsDir = join(dir, "fonts");
  const want: Array<[FontRole, string | undefined, "normal" | "italic"]> = [
    ["sans", fonts.sans, "normal"],
    ["mono", fonts.mono, "normal"],
    ["display", fonts.display, "normal"],
    // Accent words in headings are set in the display font's italic.
    ["displayItalic", fonts.display, "italic"],
  ];
  const record = join(fontsDir, "families.json");
  const had: Record<string, string> = existsSync(record) ? readJson(record) : {};
  const now: Record<string, string> = {};
  for (const [role, family, style] of want) {
    if (!family) continue;
    now[role] = family;
    const path = join(fontsDir, `${role}.woff2`);
    if (had[role] === family && existsSync(path)) continue;
    mkdirSync(fontsDir, { recursive: true });
    const urls = await googleFont(family);
    // A family without an italic falls back to its upright face.
    const url = urls[style] ?? urls.normal!;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Font download failed: ${family} (${response.status})`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    console.log(`Font ${role}: ${family}${style === "italic" && !urls.italic ? " (no italic; upright)" : ""}`);
  }
  if (Object.keys(now).length || existsSync(record)) {
    mkdirSync(fontsDir, { recursive: true });
    writeFileSync(record, JSON.stringify(now, null, 2));
  }
}

/** Is this engine file text that carries theme slots? */
export const isThemedFile = (path: string) => /\.(css|js|html)$/i.test(path);

export function readThemed(path: string, film: string): string {
  return applyTheme(readFileSync(path, "utf8"), themeSlots(film));
}
