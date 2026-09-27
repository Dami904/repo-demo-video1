// Renders a film to MP4. Usage: npm run render -- <film> [vertical] [--720] [--stills]
// --stills writes one picture per beat instead, to check layouts quickly.
//
// Follows GitDiagram's render.ts and ffmpeg.ts: headless Chrome opens the
// stage, seeks it frame by frame and pipes each screenshot into ffmpeg; the
// film is cut into contiguous segments rendered in parallel tabs, then joined
// with a soundtrack of the narration and the engine's effect cues, normalized
// to -16 LUFS. Captions are burned in.
import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { MASTER_GAIN, SFX_PEAK_DB, sfxGain } from "../lib/engine";
import { engineVersion, filmDir, readJson, ROOT } from "../lib/film";
import { startServer } from "../lib/server";
import type { VideoArtifact } from "../lib/types";

const FPS = 30;
const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith("-") && arg !== "vertical");
if (!name) throw new Error("Usage: npm run render -- <film> [vertical] [--720]");
const format = args.includes("vertical") ? "vertical" : "landscape";
const stills = args.includes("--stills");
const scale = args.includes("--720") ? 2 / 3 : 1;
const css = format === "vertical" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
const out = { w: Math.round(css.w * scale), h: Math.round(css.h * scale) };

const dir = filmDir(name);
const artifact: VideoArtifact = readJson(join(dir, "artifact.json"));
const outDir = join(dir, "out");
const workDir = join(outDir, `work-${format}`);
mkdirSync(workDir, { recursive: true });

const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
const chrome = process.env.CHROME_PATH;
if (!chrome) throw new Error("Set CHROME_PATH in .env");

interface Cue {
  name: string;
  t: number;
  gain: number;
  rate?: number;
}

type StageWindow = Window & { __renderSeek: (time: number) => void };

async function openStage(browser: Browser, origin: string): Promise<{ page: Page; sfx: Cue[] }> {
  const page = await browser.newPage();
  await page.setViewport({ width: css.w, height: css.h, deviceScaleFactor: scale });
  await page.goto(`${origin}/engine/${name}/stage.html?v=${engineVersion()}`, {
    waitUntil: "load",
    timeout: 30_000,
  });
  const sfx = await page.evaluate(
    (payload) =>
      new Promise<Cue[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("The stage did not build in time.")), 25_000);
        window.addEventListener("message", (event: MessageEvent) => {
          const data = event.data as { type?: string; sfx?: Cue[]; message?: string };
          if (data?.type === "ready") {
            clearTimeout(timer);
            resolve(data.sfx ?? []);
          } else if (data?.type === "error") {
            clearTimeout(timer);
            reject(new Error(data.message ?? "Stage error"));
          }
        });
        window.postMessage({ type: "load", ...payload }, location.origin);
      }),
    {
      spec: artifact.plan,
      meta: artifact.meta,
      timing: artifact.timing,
      captions: true,
      layout: format,
      poster: false,
      render: true,
    },
  );
  return { page, sfx };
}

function ffmpeg(argv: string[]) {
  execFileSync(ffmpegBin, ["-y", "-loglevel", "error", ...argv], { stdio: "inherit" });
}

// Each segment gets its own Chrome, as in GitDiagram: tabs of one browser
// block each other's screenshots.
function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chrome,
    headless: "shell",
    protocolTimeout: 120_000,
    args: ["--disable-gpu", "--hide-scrollbars", "--mute-audio"],
  });
}

async function renderSegment(
  origin: string,
  from: number,
  to: number,
  path: string,
  progress: (n: number) => void,
): Promise<Cue[]> {
  const browser = await launchBrowser();
  try {
    return await captureSegment(browser, origin, from, to, path, progress);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function captureSegment(
  browser: Browser,
  origin: string,
  from: number,
  to: number,
  path: string,
  progress: (n: number) => void,
): Promise<Cue[]> {
  const { page, sfx } = await openStage(browser, origin);
  const encoder = spawn(
    ffmpegBin,
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-r", String(FPS), path,
    ],
    { stdio: ["pipe", "ignore", "inherit"] },
  );
  const closed = once(encoder, "close");
  for (let index = from; index < to; index++) {
    await page.evaluate((time) => (window as unknown as StageWindow).__renderSeek(time), index / FPS);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true });
    if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");
    progress(1);
  }
  encoder.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  await page.close();
  return sfx;
}

function mixSoundtrack(cues: Cue[], path: string) {
  const inputs: string[] = [];
  const chains: string[] = [];
  const labels: string[] = [];
  const mixIn = (source: string, chain: string) => {
    const label = `[a${labels.length}]`;
    chains.push(`${source}${chain}${label}`);
    labels.push(label);
  };
  const voiceMs = Math.round(artifact.voices[0]!.start * 1000);
  inputs.push(join(dir, "narration.mp3"));
  mixIn("[0:a]", `aresample=48000,aformat=channel_layouts=stereo,adelay=${voiceMs}|${voiceMs},volume=${MASTER_GAIN}`);
  const byName = new Map<string, Cue[]>();
  for (const cue of cues) {
    if (!Object.hasOwn(SFX_PEAK_DB, cue.name)) continue;
    byName.set(cue.name, [...(byName.get(cue.name) ?? []), cue]);
  }
  for (const [effect, list] of byName) {
    const index = inputs.push(join(ROOT, "engine", "assets", "sfx", `${effect}.mp3`)) - 1;
    const copies = list.map((_, copy) => `[e${index}_${copy}]`);
    chains.push(`[${index}:a]aresample=44100,asplit=${list.length}${copies.join("")}`);
    list.forEach((cue, copy) => {
      const ms = Math.round(cue.t * 1000);
      const rate = Math.round(44100 * (cue.rate ?? 1));
      mixIn(
        copies[copy]!,
        `asetrate=${rate},aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${(MASTER_GAIN * sfxGain(cue.name, cue.gain)).toFixed(4)}`,
      );
    });
  }
  const duration = artifact.timing.DURATION.toFixed(3);
  const graph = `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad=whole_dur=${Number(duration) + 2},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:${duration}[mix]`;
  const graphPath = join(workDir, "soundtrack.graph");
  writeFileSync(graphPath, graph);
  ffmpeg([
    ...inputs.flatMap((input) => ["-i", input]),
    "-filter_complex_script", graphPath,
    "-map", "[mix]", "-c:a", "aac", "-b:a", "192k", path,
  ]);
}

const started = Date.now();
const { server, origin } = await startServer();
try {
  if (stills) {
    const browser = await launchBrowser();
    try {
      const { page } = await openStage(browser, origin);
      const stillDir = join(outDir, `stills-${format}`);
      mkdirSync(stillDir, { recursive: true });
      for (const [index, beat] of artifact.timing.beats.entries()) {
        await page.evaluate((time) => (window as unknown as StageWindow).__renderSeek(time), beat.end - 0.05);
        await page.screenshot({ path: join(stillDir, `beat-${String(index).padStart(2, "0")}.jpg`) as `${string}.jpg`, type: "jpeg", quality: 80 });
      }
      console.log(`Wrote ${artifact.timing.beats.length} stills to ${stillDir}`);
    } finally {
      await browser.close();
    }
    process.exit(0);
  }
  const frames = Math.ceil(artifact.timing.DURATION * FPS);
  const workers = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 3)));
  const size = Math.ceil(frames / workers);
  let done = 0;
  let shown = -1;
  const progress = (n: number) => {
    done += n;
    const percent = Math.floor((done / frames) * 100);
    if (percent !== shown && percent % 5 === 0) {
      shown = percent;
      process.stdout.write(`\rRendering ${format} ${out.w}x${out.h}: ${percent}%   `);
    }
  };
  const segments: string[] = [];
  const jobs: Array<Promise<Cue[]>> = [];
  for (let from = 0; from < frames; from += size) {
    const path = join(workDir, `segment-${segments.length}.mp4`);
    segments.push(path);
    jobs.push(renderSegment(origin, from, Math.min(frames, from + size), path, progress));
  }
  const cueLists = await Promise.all(jobs);
  process.stdout.write("\n");

  const soundtrack = join(workDir, "soundtrack.m4a");
  mixSoundtrack(cueLists[0] ?? [], soundtrack);

  const list = join(workDir, "segments.txt");
  writeFileSync(list, segments.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n"));
  const film = join(outDir, `${name}-${format}.mp4`);
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", list, "-i", soundtrack,
    "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", film,
  ]);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s: ${film}`);
} finally {
  server.close();
}
