// Voices plan.json with ElevenLabs and writes narration.mp3 and artifact.json.
// Usage: npm run voice -- <film>
//
// Follows GitDiagram's narration.ts: the whole script is read as one take
// (a new scene starts a new paragraph), then the take is split back into beats
// by word timings. ElevenLabs returns a time for every character, so no
// transcription step is needed. The take is cached in tts.json and only
// re-recorded when the narration changes, to save characters.
import "dotenv/config";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeWord } from "../lib/text";
import type { ShotPlan, VideoArtifact, VideoTiming } from "../lib/types";
import { filmDir, readJson } from "../lib/film";
import { logoUrl } from "../lib/theme";

const LEAD_IN_SECONDS = 0.4;
const TAIL_SECONDS = 3.6;

const name = process.argv[2];
if (!name) throw new Error("Usage: npm run voice -- <film>");
const dir = filmDir(name);
const film = readJson(join(dir, "film.json"));
const plan: ShotPlan = readJson(join(dir, "plan.json"));

// The take's text, and where each beat sits in it.
let text = "";
const spans = plan.beats.map((beat, index) => {
  const last = index === plan.beats.length - 1;
  const sceneEnds = last || plan.beats[index + 1]!.scene !== beat.scene;
  const line =
    sceneEnds && !/[.!?…]$/.test(beat.narration)
      ? `${beat.narration.replace(/[,;:]$/, "")}.`
      : beat.narration;
  if (text) text += plan.beats[index - 1]!.scene !== beat.scene ? "\n\n" : " ";
  const from = text.length;
  text += line;
  return { from, to: text.length };
});

interface Take {
  text: string;
  voice: string;
  model: string;
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const cachePath = join(dir, "tts.json");
let take: Take | null = existsSync(cachePath) ? readJson(cachePath) : null;
if (!take || take.text !== text || take.voice !== voice || take.model !== model) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY in .env");
  console.log(`Recording ${text.length} characters with ElevenLabs...`);
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, speed: 1.0 },
      }),
    },
  );
  if (!response.ok)
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  const body = await response.json();
  take = { text, voice, model, ...body } as Take;
  writeFileSync(cachePath, JSON.stringify(take));
} else {
  console.log("Narration unchanged; reusing the recorded take.");
}
writeFileSync(join(dir, "narration.mp3"), Buffer.from(take.audio_base64, "base64"));

// Map each character of our text to its time in the take. The alignment
// normally echoes the text exactly; if not, match it up character by
// character, skipping what differs.
const said = take.alignment.characters;
const starts = take.alignment.character_start_times_seconds;
const ends = take.alignment.character_end_times_seconds;
const at: Array<{ s: number; e: number } | null> = new Array(text.length).fill(null);
for (let i = 0, j = 0; i < text.length && j < said.length; i++) {
  let k = j;
  while (k < said.length && k < j + 8 && said[k] !== text[i]) k++;
  if (k < said.length && said[k] === text[i]) {
    at[i] = { s: starts[k]!, e: ends[k]! };
    j = k + 1;
  }
}

const seconds = (value: number) => Number(value.toFixed(3));
const words: Array<{ w: string; s: number; e: number; offset: number }> = [];
for (const match of text.matchAll(/\S+/g)) {
  const from = match.index!;
  const to = from + match[0].length;
  const timed = at.slice(from, to).filter(Boolean) as Array<{ s: number; e: number }>;
  const w = normalizeWord(match[0]);
  if (!timed.length || !w) continue;
  words.push({
    w,
    s: seconds(LEAD_IN_SECONDS + timed[0]!.s),
    e: seconds(LEAD_IN_SECONDS + timed.at(-1)!.e),
    offset: from,
  });
}

const beats: VideoTiming["beats"] = [];
for (const span of spans) {
  const own = words.filter((word) => word.offset >= span.from && word.offset < span.to);
  const previousEnd = beats.at(-1)?.end ?? LEAD_IN_SECONDS;
  beats.push({
    start: own[0]?.s ?? previousEnd,
    end: own.at(-1)?.e ?? previousEnd,
    words: own.map(({ w, s, e }) => ({ w, s, e })),
  });
}
const speechEnd = beats.at(-1)?.end ?? 0;
const takeSeconds = ends.at(-1) ?? 0;
const soundEnd = Math.max(speechEnd, LEAD_IN_SECONDS + takeSeconds);
const timing: VideoTiming = {
  DURATION: Math.ceil((soundEnd + TAIL_SECONDS) * 10) / 10,
  SPEECH_END: seconds(speechEnd),
  beats,
};

const artifact = {
  repository: `${film.meta.owner}/${film.meta.repo}`,
  createdAt: new Date().toISOString(),
  meta: { ...film.meta, logo: logoUrl(name) },
  timing,
  voices: [{ start: LEAD_IN_SECONDS }],
  version: 2,
  plan,
} satisfies Omit<VideoArtifact, "stats">;
writeFileSync(join(dir, "artifact.json"), JSON.stringify(artifact, null, 2));
console.log(
  `Wrote narration.mp3 and artifact.json: ${timing.DURATION}s film, speech ends at ${timing.SPEECH_END}s.`,
);
