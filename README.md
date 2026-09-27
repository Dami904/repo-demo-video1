# gitdiagram-repo-video

Narrated explainer videos for GitHub repositories, each styled in the
repository's own colours, fonts and logo, voiced by ElevenLabs.

The animation engine and scene validator are adapted from
[GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram). The films
themselves carry no GitDiagram branding. Claude Code writes each film's script
and scenes in a chat session.

## License

MIT, copyright 2026 Dami904 ([LICENSE](LICENSE)). The engine (`engine/`) and
the validator (`lib/shots.ts`, `lib/script.ts`, `lib/text.ts`, `lib/types.ts`,
`lib/engine.ts`) are adapted from GitDiagram, MIT, copyright 2024 Ahmed Khaleel;
its notice is kept in [LICENSE-gitdiagram](LICENSE-gitdiagram), as the MIT
licence requires.

## Setup

Needs Node 22+, Chrome and ffmpeg. Put your key in `.env`:

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb   # "George"
ELEVENLABS_MODEL=eleven_multilingual_v2
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

```
npm install
```

## Making a film

Each film lives in `videos/<name>/`:

| File | What it is |
|---|---|
| `source/` | a clone of the repository (for checking paths and code) |
| `film.json` | repo facts, the files code panels quote, README pictures, theme, target `seconds` |
| `script.json` | the story, cut into beats (4-16 words each) grouped into scenes |
| `shots.json` | the scene design for each beat (the engine's shot language) |
| `captures.json` | optional: screen recordings of the live product (see below) |

Then:

```
npm run capture -- <name>    # optional: record the live product (captures.json)
npm run plan -- <name>       # validate into plan.json (fix any warnings)
npm run voice -- <name> --dry        # free: estimated timings over silence, for checking layouts
npm run voice -- <name>      # ElevenLabs take + word timings -> artifact.json
npm run render -- <name> --stills --720   # one picture per beat, to check layouts
npm run preview -- <name>    # watch it at http://127.0.0.1:4321/?film=<name>
npm run render -- <name>             # 1080p landscape MP4
npm run render -- <name> vertical    # 1080x1920 vertical MP4 (Shorts, Reels, TikTok)
```

MP4s land in `videos/<name>/out/`. The voice is only re-recorded when the
narration text changes (cached in `tts.json`), so layout changes cost no
ElevenLabs characters.

A one-minute explainer is about 125 words; a three-minute demo about 460. Set
`"seconds"` in `film.json` and `npm run plan` warns when the script runs long
or short for it (the narrator says about 2.55 words a second).

The rules for writing `script.json` and `shots.json` are GitDiagram's prompt:
`SHOT_SYSTEM` in `src/server/explainer/shot-prompt.ts` of the GitDiagram repo.

## Real product footage

`npm run capture -- <name> [clip]` opens the live site in headless Chrome,
performs the steps in `captures.json` (clicks, slider drags, scrolls) with a
visible cursor, and saves each clip as `videos/<name>/<id>.mp4`, plus the time
of every click in `<id>.marks.json`:

```json
{ "site": "https://example.app",
  "clips": [{ "id": "attack", "path": "/simulate", "viewport": [1440, 900],
              "scrollY": 250, "ready": "Attack lab",
              "steps": [{ "wait": 600 }, { "click": "::-p-text(Stale evidence)" },
                        { "drag": [237, 185, 560, 185] }, { "scrollTo": 1200 }] }] }
```

A shot shows a clip as a `video` element (`"src": "attack"`), which starts on its
`at` word and follows the film clock frame by frame. To land a click on the word
that describes it, give the element `"sync": { "word": "refused", "mark": 0 }`; a
second point, `"syncEnd": { "word": "pauses", "mark": 2 }`, also sets the playback
speed between them. `npm run voice` works out the timing from the real take.
Keep fine print you don't want in the film out of frame when choosing scrolls.

## Themes

Each film takes its look from the repository it explains: `film.json` has a
`theme` with colours (from the repo's CSS or Tailwind config), Google Fonts
families and an optional logo path in the repo:

```json
"theme": {
  "colors": { "paper": "#171717", "ink": "#fafafa", "accent": "#3987e5" },
  "fonts": { "sans": "DM Sans", "mono": "Geist Mono", "display": "DM Sans" },
  "logo": "frontend/public/logo.svg"
}
```

Every colour slot and its default is listed in `lib/theme.ts`. `npm run plan`
downloads the fonts and copies the logo; run `npm run voice` after changing the
logo (it is free when the narration is unchanged). The engine's CSS and JS name
their colours as `@@slots@@`, which the server fills per film at
`/engine/<film>/`, so one engine serves every theme.

The logo appears once, on the closing card, in front of the outro line and as
tall as its capitals.
