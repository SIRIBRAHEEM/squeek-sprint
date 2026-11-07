export default async function handler(_req, res) {
  try {
    const upstream = await fetch("https://api.squeekchain.com/v1/status", {
      headers: { accept: "application/json" },
    });
    const ctype = upstream.headers.get("content-type") || "";
    const body = await upstream.text();
    if (!upstream.ok || !ctype.includes("json")) {
      res.status(502).json({
        error: "upstream_unavailable",
        upstreamStatus: upstream.status,
      });
      return;
    }
    res
      .status(200)
      .setHeader("content-type", "application/json; charset=utf-8")
      .setHeader("cache-control", "no-store")
      .send(body);
  } catch {
    res.status(502).json({ error: "upstream_unavailable" });
  }
}
