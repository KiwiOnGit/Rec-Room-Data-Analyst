export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "Invalid url" }); }

  const allowed = ["rec.net", "api.rec.net", "accounts.rec.net", "rooms.rec.net", "img.rec.net"];
  const ok = allowed.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  if (!ok) return res.status(403).json({ error: "Forbidden host" });

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "RecRoomArchive/1.0", "Accept": "application/json" },
    });
    const data = await upstream.json();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
