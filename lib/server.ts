// A small static server: the engine at /engine/<film>/ (its CSS, JS and HTML
// filled with that film's theme), films at /videos/, and the preview page.
// The stage talks to its parent through same-origin postMessage, so
// everything must come from one origin.
import { createReadStream, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { isThemedFile, readThemed } from "./theme";

const ROOT = resolve(import.meta.dirname, "..");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const ENGINE = join(ROOT, "engine");

const MOUNTS: Array<[string, string]> = [
  ["/videos/", join(ROOT, "videos")],
  ["/", join(ROOT, "preview")],
];

function fileFor(pathname: string): string | null {
  for (const [prefix, dir] of MOUNTS) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
    const path = normalize(join(dir, rest));
    if (!path.startsWith(dir)) return null;
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      /* try the next mount */
    }
  }
  return null;
}

export function startServer(port = 0): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const engine = /^\/engine\/([\w.-]+)\/(.*)$/.exec(url.pathname);
    if (engine) {
      const path = normalize(join(ENGINE, decodeURIComponent(engine[2]!)));
      let exists = false;
      try {
        exists = path.startsWith(ENGINE) && statSync(path).isFile();
      } catch {
        /* missing */
      }
      if (!exists) {
        response.writeHead(404).end("Not found");
        return;
      }
      if (isThemedFile(path)) {
        let body: string;
        try {
          body = readThemed(path, engine[1]!);
        } catch (error) {
          response.writeHead(500).end(String(error));
          return;
        }
        response.writeHead(200, {
          "content-type": TYPES[extname(path).toLowerCase()] ?? "text/plain",
          "cache-control": "no-store",
        });
        response.end(body);
        return;
      }
      sendFile(path, request.headers.range, response);
      return;
    }
    const path = fileFor(url.pathname);
    if (!path) {
      response.writeHead(404).end("Not found");
      return;
    }
    sendFile(path, request.headers.range, response);
  });
  return new Promise((done) =>
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      done({ server, origin: `http://127.0.0.1:${actual}` });
    }),
  );
}

function sendFile(path: string, rangeHeader: string | undefined, response: ServerResponse) {
  const size = statSync(path).size;
  const type = TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
  // Audio seeking needs byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    response.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    createReadStream(path, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    "content-type": type,
    "content-length": size,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
}
