import { keccak_256 } from "@noble/hashes/sha3.js";

const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const RESOLVER_SELECTOR = "0178b8bf";
const NAME_SELECTOR = "691f3431";
const ADDR_SELECTOR = "3b3b57de";
const RPCS = ["https://ethereum.publicnode.com", "https://cloudflare-eth.com"];

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function namehash(name: string): Uint8Array {
  let node = new Uint8Array(32);
  if (!name) return node;
  const labels = name.split(".");
  for (let i = labels.length - 1; i >= 0; i -= 1) {
    const label = labels[i];
    if (!label) continue;
    const labelHash = keccak_256(new TextEncoder().encode(label));
    const packed = new Uint8Array(64);
    packed.set(node, 0);
    packed.set(labelHash, 32);
    node = keccak_256(packed);
  }
  return node;
}

async function ethCall(to: string, data: string): Promise<string | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  for (const rpc of RPCS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { result?: unknown };
      if (typeof json.result === "string" && json.result.startsWith("0x")) return json.result;
    } catch {
      /* try the next public mainnet endpoint */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function word(data: string, index: number): string {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  return hex.slice(index * 64, index * 64 + 64);
}

function decodeAddress(data: string): string | null {
  const slot = word(data, 0);
  if (slot.length < 64) return null;
  const addr = `0x${slot.slice(24).toLowerCase()}`;
  if (!/^0x[0-9a-f]{40}$/.test(addr) || addr === `0x${"0".repeat(40)}`) return null;
  return addr;
}

function decodeString(data: string): string | null {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 128) return null;
  const length = Number.parseInt(word(data, 1), 16);
  if (!Number.isFinite(length) || length <= 0 || length > 128) return null;
  const bytes = hexToBytes(hex.slice(128, 128 + length * 2));
  const text = new TextDecoder().decode(bytes).replace(/\0/g, "");
  return text.length > 0 ? text : null;
}

/** Mainnet reverse ENS. Returns null when the lookup fails or does not verify. */
export async function lookupEns(address: string): Promise<string | null> {
  const lower = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) return null;
  const reverseNode = bytesToHex(namehash(`${lower.slice(2)}.addr.reverse`)).slice(2);
  const resolverData = await ethCall(REGISTRY, `0x${RESOLVER_SELECTOR}${reverseNode}`);
  const resolver = resolverData ? decodeAddress(resolverData) : null;
  if (!resolver) return null;
  const nameData = await ethCall(resolver, `0x${NAME_SELECTOR}${reverseNode}`);
  const name = nameData ? decodeString(nameData) : null;
  if (!name || !name.includes(".")) return null;
  const forwardNode = bytesToHex(namehash(name)).slice(2);
  const forwardResolverData = await ethCall(REGISTRY, `0x${RESOLVER_SELECTOR}${forwardNode}`);
  const forwardResolver = forwardResolverData ? decodeAddress(forwardResolverData) : null;
  if (!forwardResolver) return null;
  const addrData = await ethCall(forwardResolver, `0x${ADDR_SELECTOR}${forwardNode}`);
  const resolved = addrData ? decodeAddress(addrData) : null;
  if (resolved !== lower) return null;
  return name;
}
