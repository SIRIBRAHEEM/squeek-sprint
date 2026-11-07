const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req, res) {
  const address = typeof req.query?.address === "string" ? req.query.address : "";
  if (!ADDRESS.test(address)) {
    res.status(400).json({ error: "invalid_address" });
    return;
  }
  try {
    const upstream = await fetch(
      `https://api.squeekchain.com/v1/accounts/${address.toLowerCase()}?limit=25`,
      { headers: { accept: "application/json" } },
    );
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
