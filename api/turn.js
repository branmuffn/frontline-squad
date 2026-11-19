// Vercel function: short-lived Cloudflare TURN relay logins for multiplayer (Brian OK'd the relay, 2026-11-19).
// Players behind strict networks (mobile data, hotspots, some school/office Wi-Fi) can't link directly; the relay
// forwards their game traffic. The secret API token stays here on Vercel; players only get logins that expire.
// Setup (once): Vercel project > Settings > Environment Variables: TURN_KEY_ID and TURN_KEY_API_TOKEN from
// Cloudflare dashboard > Realtime > TURN Server. Until both are set this answers 204 and the game stays direct-only.
const TTL = 6 * 3600; // a login lasts 6 hours (longer than any match)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = process.env.TURN_KEY_ID, token = process.env.TURN_KEY_API_TOKEN;
  if (!id || !token) return res.status(204).end();
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return res.status(502).json({ error: `relay service said ${r.status}` });
    const { iceServers = [] } = await r.json();
    // Browsers block port 53; drop those addresses so connecting doesn't wait on them (Cloudflare's own advice).
    const list = iceServers.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53\b/.test(u)) })).filter((s) => s.urls.length);
    res.status(200).json({ iceServers: list, expires: Date.now() + (TTL - 1800) * 1000 });
  } catch {
    res.status(502).json({ error: 'relay service unreachable' });
  }
}
