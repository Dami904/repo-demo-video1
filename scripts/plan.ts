// Checks a film's script and shots with GitDiagram's own validator and writes
// plan.json. Usage: npm run plan -- <film folder name>
//
// videos/<film>/ holds:
//   film.json   { meta, sourceFiles: [paths the code panels quote],
//                 images?: { img1: "docs/screenshot.png" } (README pictures),
//                 theme?: colours, fonts and logo (see lib/theme.ts) }
//   script.json the director's script: { title, outro, story, beats: [{ scene, narration, brief }] }
//   shots.json  the designer's shots:  { shots: [{ beat, transition?, elements, actions }] }
//   source/     a clone of the repository (for the path and code checks)
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { join } from "node:path";
import { normalizeScript, scriptWordCount } from "../lib/script";
import { normalizeShots } from "../lib/shots";
import { filmDir, readJson } from "../lib/film";
import { prepareTheme } from "../lib/theme";

const name = process.argv[2];
if (!name) throw new Error("Usage: npm run plan -- <film>");
const dir = filmDir(name);
const film = readJson(join(dir, "film.json"));
const rawScript = readJson(join(dir, "script.json"));
const rawShots = readJson(join(dir, "shots.json"));
const source = join(dir, "source");

const paths = execFileSync("git", ["-C", source, "ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const sourceText = (film.sourceFiles as string[])
  .map((path) => `// ${path}\n${readFileSync(join(source, path), "utf8")}`)
  .join("\n\n");
const readme = readFileSync(join(source, "README.md"), "utf8");
const material = [film.meta.description, readme, paths.join("\n"), sourceText].join("\n");

const script = normalizeScript(rawScript, film.meta.repo, material);

// The voice reads the beats in order as one take; they must be the story.
const joined = script.beats.map((beat) => beat.narration).join(" ");
const story = String(rawScript.story ?? "").replace(/\s+/g, " ").trim();
if (story && joined !== story)
  console.warn("! The beats' narration does not match the story word for word.");
const words = scriptWordCount(script);
console.log(
  `Script: ${script.beats.length} beats, ${new Set(script.beats.map((b) => b.scene)).size} scenes, ${words} words.`,
);
if (words < 110 || words > 140) console.warn(`! Aim for 110-130 words (have ${words}).`);

const designed = new Map<number, Record<string, unknown>>();
for (const shot of rawShots.shots as Array<Record<string, unknown>>)
  designed.set(Number(shot.beat), shot);

// README pictures are copied next to the film and served from there.
const images: Record<string, string> = {};
for (const [id, path] of Object.entries((film.images ?? {}) as Record<string, string>)) {
  const file = `${id}${extname(path).toLowerCase()}`;
  copyFileSync(join(source, path), join(dir, file));
  images[id] = `/videos/${name}/${file}`;
}

const { plan, warnings } = normalizeShots(script, designed, {
  name: film.meta.repo,
  paths,
  sourceText,
  material,
  images: Object.keys(images),
});
if (Object.keys(images).length) plan.images = images;
for (const warning of warnings) console.warn(`! ${warning}`);
writeFileSync(join(dir, "plan.json"), JSON.stringify(plan, null, 2));
await prepareTheme(name, source);
console.log(`Wrote ${join(dir, "plan.json")} (${warnings.length} warnings).`);
