# gitdiagram-repo-video

Narrated explainer videos for GitHub repositories, each styled in the
repository's own colours, fonts and logo, voiced by ElevenLabs.

The animation engine and scene validator are adapted from
[GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) (MIT; its
licence is kept in `LICENSE-gitdiagram`, as the MIT licence requires). The
films themselves carry no GitDiagram branding. Claude Code writes each
film's script and scenes in a chat session.

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
| `film.json` | repo facts, the files code panels quote, README pictures, theme |
| `script.json` | the story, cut into 12-16 beats in 5-7 scenes |
| `shots.json` | the scene design for each beat (the engine's shot language) |

Then:

```
npm run plan -- <name>       # validate into plan.json (fix any warnings)
npm run voice -- <name>      # ElevenLabs take + word timings -> artifact.json
npm run render -- <name> --stills --720   # one picture per beat, to check layouts
npm run preview -- <name>    # watch it at http://127.0.0.1:4321/?film=<name>
npm run render -- <name>             # 1080p landscape MP4
npm run render -- <name> vertical    # 1080x1920 vertical MP4 (Shorts, Reels, TikTok)
```

MP4s land in `videos/<name>/out/`. The voice is only re-recorded when the
narration text changes (cached in `tts.json`), so layout changes cost no
ElevenLabs characters.

The rules for writing `script.json` and `shots.json` are GitDiagram's prompt:
`SHOT_SYSTEM` in `src/server/explainer/shot-prompt.ts` of the GitDiagram repo.

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
