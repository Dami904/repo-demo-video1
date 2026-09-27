// Serves the preview. Usage: npm run preview [-- <film>]
import { startServer } from "../lib/server";

const film = process.argv[2] || "gitdiagram";
const port = Number(process.env.PORT) || 4321;
const { origin } = await startServer(port);
console.log(`Preview: ${origin}/?film=${encodeURIComponent(film)}`);
console.log(`Vertical: ${origin}/?film=${encodeURIComponent(film)}&layout=vertical`);
