// Checks the ElevenLabs key and lists the voices it can use.
import "dotenv/config";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("Set ELEVENLABS_API_KEY in .env");

const get = async (path: string) => {
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    headers: { "xi-api-key": key },
  });
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
};

// A restricted key may lack the user_read permission; the quota is optional.
try {
  const sub = await get("/v1/user/subscription");
  console.log(
    `Plan: ${sub.tier}. Characters used ${sub.character_count} of ${sub.character_limit}.`,
  );
} catch {
  console.log("(This key cannot read the plan and quota; skipping.)");
}
const { voices } = await get("/v1/voices");
for (const voice of voices)
  console.log(
    `${voice.voice_id}  ${voice.name}  (${voice.category}; ${Object.values(voice.labels ?? {}).join(", ")})`,
  );
