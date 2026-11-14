import { binToHex, cashAddressToLockingBytecode, sha256 } from "@bitauth/libauth";
import { assertP2pkh, type NetworkId } from "./address.ts";
import type { SpendableCoin } from "./settle.ts";

/** Public Fulcrum endpoints. The first that answers is used; the rest are fallbacks. */
export const ELECTRUM_SERVERS: Record<NetworkId, string[]> = {
  chipnet: ["wss://chipnet.bch.ninja:50004", "wss://chipnet.imaginary.cash:50004"],
  mainnet: [
    "wss://cashnode.bch.ninja:443",
    "wss://electrum.imaginary.cash:50004",
    "wss://bch.imaginary.cash:50004",
  ],
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class ElectrumClient {
  private socket: WebSocket | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`Timed out connecting to ${this.url}`));
      }, timeoutMs);
      socket.onopen = () => {
        clearTimeout(timer);
        this.socket = socket;
        socket.onmessage = (event) => this.onMessage(String(event.data));
        socket.onclose = () => this.failAll(new Error("Electrum connection closed"));
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Could not connect to ${this.url}`));
      };
    });
  }

  async request(method: string, params: unknown[] = [], timeoutMs = 12_000): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Electrum is not connected");
    const id = ++this.nextId;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.send(payload);
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private onMessage(raw: string): void {
    let parsed: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return;
    }
    if (typeof parsed.id !== "number") return;
    const waiter = this.pending.get(parsed.id);
    if (!waiter) return;
    this.pending.delete(parsed.id);
    if (parsed.error) waiter.reject(new Error(parsed.error.message ?? "Electrum error"));
    else waiter.resolve(parsed.result);
  }

  private failAll(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}

export async function withElectrum<T>(network: NetworkId, run: (client: ElectrumClient) => Promise<T>): Promise<T> {
  let last = "No Electrum server responded";
  for (const url of ELECTRUM_SERVERS[network]) {
    const client = new ElectrumClient(url);
    try {
      await client.connect();
      await client.request("server.version", ["Settlemany", "1.4"]);
      const result = await run(client);
      client.close();
      return result;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      client.close();
    }
  }
  throw new Error(`Could not reach a ${network} Electrum server. ${last}`);
}

export function scriptHash(lockingBytecode: Uint8Array): string {
  const hashed = sha256.hash(lockingBytecode);
  const reversed = new Uint8Array(hashed.length);
  for (let index = 0; index < hashed.length; index += 1) reversed[index] = hashed[hashed.length - 1 - index]!;
  return binToHex(reversed);
}

type RawUtxo = {
  tx_hash?: string;
  tx_pos?: number;
  value?: number | string;
  token_data?: {
    amount?: string | number;
    category?: string;
    nft?: { capability?: string };
  };
};

export async function coinsForAddress(client: ElectrumClient, address: string, ownerId: string): Promise<SpendableCoin[]> {
  const decoded = cashAddressToLockingBytecode(address.trim());
  if (typeof decoded === "string") throw new Error(decoded);
  assertP2pkh(decoded.bytecode);
  const result = await client.request("blockchain.scripthash.listunspent", [scriptHash(decoded.bytecode)]);
  if (!Array.isArray(result)) return [];
  const coins: SpendableCoin[] = [];
  for (const entry of result as RawUtxo[]) {
    if (!entry.tx_hash || entry.tx_pos === undefined || entry.value === undefined) continue;
    if (entry.token_data?.nft) continue;
    const tokenAmount = entry.token_data?.amount !== undefined ? BigInt(entry.token_data.amount) : 0n;
    const category = entry.token_data?.category?.toLowerCase() ?? null;
    coins.push({
      txid: entry.tx_hash,
      vout: entry.tx_pos,
      satoshis: BigInt(entry.value),
      lockingBytecode: decoded.bytecode,
      tokenAmount,
      tokenCategoryHex: tokenAmount > 0n ? category : null,
      ownerId,
    });
  }
  return coins;
}

export async function broadcast(client: ElectrumClient, txHex: string): Promise<string> {
  const result = await client.request("blockchain.transaction.broadcast", [txHex]);
  if (typeof result !== "string" || result.length < 64) {
    throw new Error("The network did not return a transaction id.");
  }
  return result;
}
