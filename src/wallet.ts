import { lookupEns } from "./ens";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface DetectedWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: Eip1193Provider;
}

interface AnnounceDetail {
  info?: { uuid?: string; name?: string; icon?: string; rdns?: string };
  provider?: Eip1193Provider;
}

interface LegacyProvider extends Eip1193Provider {
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isOkxWallet?: boolean;
  isPhantom?: boolean;
}

interface Pref {
  rdns: string;
  uuid: string;
  optOut: boolean;
}

const PREF_KEY = "squeek-sprint-wallet";
export const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";

const ensCache = new Map<string, string | null>();

function loadPref(): Pref | null {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pref>;
    if (typeof parsed.rdns !== "string" || typeof parsed.uuid !== "string") return null;
    return { rdns: parsed.rdns, uuid: parsed.uuid, optOut: Boolean(parsed.optOut) };
  } catch {
    return null;
  }
}

function savePref(pref: Pref | null): void {
  try {
    if (!pref) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota */
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function chainLabel(chainId: number | null): string {
  if (chainId === null) return "Network unknown";
  if (chainId === SEPOLIA_CHAIN_ID) return "Sepolia";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

export function isMobileDevice(): boolean {
  const narrow = window.matchMedia?.("(max-width: 820px)").matches ?? false;
  return narrow || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

export function walletDeepLinks(): { name: string; href: string }[] {
  const here = window.location.href;
  const hostPath = `${window.location.host}${window.location.pathname}${window.location.search}`;
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${hostPath}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(here)}` },
  ];
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function legacyName(provider: LegacyProvider): string {
  if (provider.isRabby) return "Rabby";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isOkxWallet) return "OKX Wallet";
  if (provider.isPhantom) return "Phantom";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

export class WalletController {
  wallets: DetectedWallet[] = [];
  connected: DetectedWallet | null = null;
  address: string | null = null;
  ens: string | null = null;
  chainId: number | null = null;
  error: string | null = null;
  busy = false;
  private seen = new Set<string>();
  private listeners = new Set<() => void>();
  private onAccounts = (value: unknown) => {
    const accounts = Array.isArray(value) ? value.filter(isAddress) : [];
    if (accounts.length === 0) {
      this.address = null;
      this.ens = null;
      this.emit();
      return;
    }
    void this.setAddress(accounts[0]);
  };
  private onChain = (value: unknown) => {
    this.chainId = parseChainId(value);
    this.emit();
  };

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    window.addEventListener("eip6963:announceProvider", this.onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => this.addLegacy(), 50);
    window.setTimeout(() => this.addLegacy(), 500);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private onAnnounce = (event: Event): void => {
    const detail = (event as CustomEvent<AnnounceDetail>).detail;
    const provider = detail?.provider;
    const info = detail?.info;
    if (!provider || typeof provider.request !== "function" || !info) return;
    const rdns = info.rdns || info.uuid || info.name;
    if (!rdns || this.seen.has(rdns) || this.wallets.some((wallet) => wallet.provider === provider)) return;
    this.seen.add(rdns);
    this.wallets.push({
      uuid: info.uuid || rdns,
      name: info.name || "Wallet",
      icon: typeof info.icon === "string" ? info.icon : "",
      rdns,
      provider,
    });
    this.emit();
    void this.trySilent();
  };

  private addLegacy(): void {
    const injected = (window as Window & { ethereum?: LegacyProvider }).ethereum;
    if (!injected) return;
    const list = Array.isArray(injected.providers) && injected.providers.length > 0 ? injected.providers : [injected];
    let changed = false;
    for (const provider of list) {
      if (this.wallets.some((wallet) => wallet.provider === provider)) continue;
      const named = provider as LegacyProvider;
      const name = legacyName(named);
      const rdns = `legacy:${name}:${this.wallets.length}`;
      if (this.seen.has(rdns)) continue;
      this.seen.add(rdns);
      this.wallets.push({ uuid: rdns, name, icon: "", rdns, provider });
      changed = true;
    }
    if (changed) {
      this.emit();
      void this.trySilent();
    }
  }

  private async trySilent(): Promise<void> {
    if (this.connected || this.busy) return;
    const pref = loadPref();
    if (!pref || pref.optOut) return;
    const wallet = this.wallets.find((item) => item.rdns === pref.rdns || item.uuid === pref.uuid);
    if (!wallet) return;
    try {
      const accounts = await wallet.provider.request({ method: "eth_accounts" });
      const list = Array.isArray(accounts) ? accounts.filter(isAddress) : [];
      if (!list[0]) return;
      await this.adopt(wallet, list[0]);
    } catch {
      /* eth_accounts should not prompt; a failure just leaves the guest path */
    }
  }

  async connect(rdns: string): Promise<void> {
    const wallet = this.wallets.find((item) => item.rdns === rdns);
    if (!wallet) return;
    this.busy = true;
    this.error = null;
    this.emit();
    try {
      const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
      const list = Array.isArray(accounts) ? accounts.filter(isAddress) : [];
      if (!list[0]) throw new Error("The wallet did not return an account.");
      savePref({ rdns: wallet.rdns, uuid: wallet.uuid, optOut: false });
      await this.adopt(wallet, list[0]);
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? Number((err as { code: number }).code) : 0;
      this.error = code === 4001 ? "Connection cancelled in the wallet." : "Could not connect that wallet.";
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  disconnect(): void {
    const current = this.connected;
    this.unbind(current?.provider);
    const pref = loadPref();
    if (pref) savePref({ ...pref, optOut: true });
    this.connected = null;
    this.address = null;
    this.ens = null;
    this.chainId = null;
    this.error = null;
    this.emit();
  }

  async switchToSepolia(): Promise<void> {
    const provider = this.connected?.provider;
    if (!provider) return;
    this.error = null;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX }],
      });
      this.chainId = SEPOLIA_CHAIN_ID;
      this.emit();
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? Number((err as { code: number }).code) : 0;
      if (code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_HEX,
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.sepolia.org"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
          this.chainId = SEPOLIA_CHAIN_ID;
        } catch {
          this.error = "Sepolia was not added.";
        }
      } else if (code !== 4001) {
        this.error = "Could not switch to Sepolia.";
      }
      this.emit();
    }
  }

  private async adopt(wallet: DetectedWallet, address: string): Promise<void> {
    if (this.connected && this.connected.provider !== wallet.provider) this.unbind(this.connected.provider);
    this.connected = wallet;
    this.bind(wallet.provider);
    try {
      this.chainId = parseChainId(await wallet.provider.request({ method: "eth_chainId" }));
    } catch {
      this.chainId = null;
    }
    await this.setAddress(address);
  }

  private async setAddress(address: string): Promise<void> {
    this.address = address;
    this.ens = ensCache.get(address.toLowerCase()) ?? null;
    this.emit();
    if (ensCache.has(address.toLowerCase())) return;
    const name = await lookupEns(address);
    ensCache.set(address.toLowerCase(), name);
    if (this.address?.toLowerCase() === address.toLowerCase()) {
      this.ens = name;
      this.emit();
    }
  }

  private bind(provider: Eip1193Provider): void {
    provider.on?.("accountsChanged", this.onAccounts);
    provider.on?.("chainChanged", this.onChain);
  }

  private unbind(provider: Eip1193Provider | undefined): void {
    provider?.removeListener?.("accountsChanged", this.onAccounts);
    provider?.removeListener?.("chainChanged", this.onChain);
  }
}
