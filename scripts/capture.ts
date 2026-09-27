// Records the real product for a film. Usage: npm run capture -- <film> [clip id]
//
// videos/<film>/captures.json:
//   {
//     "site": "https://example.app",
//     "clips": [{
//       "id": "attack",               // becomes videos/<film>/attack.mp4, used as { "kind": "video", "src": "attack" }
//       "path": "/simulate",
//       "viewport": [1440, 900],
//       "scrollY": 250,               // optional, before recording starts
//       "ready": "Attack lab",        // text that must be on the page before recording
//       "steps": [
//         { "wait": 800 },
//         { "click": "::-p-text(per-deposit cap)" },   // any Puppeteer selector
//         { "scroll": 400 },                          // smooth scroll by this much
//         { "scrollTo": 1200 },                        // smooth scroll to this y
//         { "drag": [240, 185, 520, 185] }             // press, glide, release (viewport x1 y1 x2 y2)
//       ]
//     }]
//   }
//
// Headless Chrome draws no cursor, so a visible one is added to the page and
// glides to each target before the click. Clips are re-encoded with every
// frame a keyframe, so the renderer can seek them frame-exactly. The time of
// every click and drag lands in <id>.marks.json, so a film can line a click up
// with the word that describes it ({ "sync": { "word": "flips", "mark": 0 } }).
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { filmDir, readJson } from "../lib/film";

interface Step {
  wait?: number;
  click?: string;
  scroll?: number;
  scrollTo?: number;
  drag?: [number, number, number, number];
}
interface Clip {
  id: string;
  path: string;
  viewport?: [number, number];
  scrollY?: number;
  ready?: string;
  steps: Step[];
}

const [name, only] = process.argv.slice(2);
if (!name) throw new Error("Usage: npm run capture -- <film> [clip id]");
const dir = filmDir(name);
const config = readJson(join(dir, "captures.json")) as { site: string; clips: Clip[] };
const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// A plain arrow cursor with a click ripple, drawn above the page.
const CURSOR = `(() => {
  if (document.getElementById("__cursor")) return;
  const c = document.createElement("div");
  c.id = "__cursor";
  c.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 0.7s cubic-bezier(0.22,1,0.36,1)";
  c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2.5 20 12l-7.2 1.6L9.4 21z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  window.__moveCursor = (x, y) => { c.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)"; };
  window.__ripple = (x, y) => {
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;left:" + (x - 18) + "px;top:" + (y - 18) + "px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(47,102,144,0.8);z-index:2147483646;pointer-events:none;transform:scale(0.3);opacity:1;transition:transform 0.5s ease-out,opacity 0.5s ease-out";
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.6)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
  };
})()`;

type CursorWindow = { __moveCursor: (a: number, b: number) => void; __ripple: (a: number, b: number) => void };

async function dragLikeAPerson(page: Page, [x1, y1, x2, y2]: [number, number, number, number], mark: () => void) {
  await page.evaluate((px, py) => (window as unknown as CursorWindow).__moveCursor(px, py), x1, y1);
  await sleep(800);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  mark();
  // The cursor follows the mouse without its glide while dragging.
  await page.evaluate(() => {
    const c = document.getElementById("__cursor");
    if (c) c.style.transition = "none";
  });
  const steps = 36;
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    await page.mouse.move(x, y);
    await page.evaluate((px, py) => (window as unknown as CursorWindow).__moveCursor(px, py), x, y);
    await sleep(33);
  }
  await page.mouse.up();
  await page.evaluate(() => {
    const c = document.getElementById("__cursor");
    if (c) c.style.transition = "transform 0.7s cubic-bezier(0.22,1,0.36,1)";
  });
}

async function clickLikeAPerson(page: Page, selector: string, mark: () => void) {
  const handle = await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
  if (!handle) throw new Error(`Nothing matches ${selector}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`${selector} is not on screen`);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.evaluate((px, py) => (window as unknown as { __moveCursor: (a: number, b: number) => void }).__moveCursor(px, py), x, y);
  await sleep(800);
  await page.evaluate((px, py) => (window as unknown as { __ripple: (a: number, b: number) => void }).__ripple(px, py), x, y);
  mark();
  await page.mouse.click(x, y);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: "shell",
  args: ["--hide-scrollbars", "--mute-audio"],
});
try {
  for (const clip of config.clips) {
    if (only && clip.id !== only) continue;
    const [width, height] = clip.viewport ?? [1440, 900];
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    const started = Date.now();
    // Hosted demo backends may be asleep; give them time to wake.
    await page.goto(config.site + clip.path, { waitUntil: "networkidle2", timeout: 180_000 });
    if (clip.ready)
      await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 180_000 }, clip.ready);
    if (clip.scrollY) await page.evaluate((y) => window.scrollTo(0, y), clip.scrollY);
    await page.evaluate(CURSOR);
    // Park the cursor mid-screen before the recording starts.
    await page.evaluate((x, y) => (window as unknown as { __moveCursor: (a: number, b: number) => void }).__moveCursor(x, y), width * 0.55, height * 0.6);
    await sleep(900);
    console.log(`${clip.id}: page ready in ${Math.round((Date.now() - started) / 1000)}s, recording...`);

    const raw = join(dir, `${clip.id}.raw.webm`);
    const recorder = await page.screencast({ path: raw as `${string}.webm`, fps: 30, ffmpegPath: ffmpegBin });
    const recordingStarted = Date.now();
    const marks: number[] = [];
    const mark = () => marks.push(Number(((Date.now() - recordingStarted) / 1000).toFixed(2)));
    for (const step of clip.steps) {
      if (step.wait) await sleep(step.wait);
      if (step.click) await clickLikeAPerson(page, step.click, mark);
      if (step.drag) await dragLikeAPerson(page, step.drag, mark);
      if (step.scroll) {
        await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), step.scroll);
        await sleep(1000);
      }
      if (step.scrollTo !== undefined) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), step.scrollTo);
        await sleep(1000);
      }
    }
    await recorder.stop();
    await page.close();

    const out = join(dir, `${clip.id}.mp4`);
    execFileSync(ffmpegBin, [
      "-y", "-loglevel", "error", "-i", raw,
      "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
      "-g", "1", "-an", "-movflags", "+faststart", out,
    ]);
    rmSync(raw, { force: true });
    writeFileSync(join(dir, `${clip.id}.marks.json`), JSON.stringify(marks));
    const seconds = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).trim();
    console.log(`${clip.id}: wrote ${out} (${Number(seconds).toFixed(1)}s; clicks at ${marks.join(", ")}s)`);
  }
} finally {
  await browser.close();
}
