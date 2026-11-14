import { generateBip39Mnemonic } from "@bitauth/libauth";
import { stopElectrumNetwork } from "@electrum-cash/application";
import { Engine, XO_SUPPORTED_NETWORKS, type XONetwork } from "@xo-cash/engine";
import { StorageType } from "@xo-cash/state";
import type { NetworkId } from "../chain/address.ts";
import { settlemanyTemplate } from "./settlemanyTemplate.ts";

const COORDINATOR_KEY = "settlemany.xoCoordinator.v1";

export class XoEngineNetworkError extends Error {
  readonly openNetwork: XONetwork;
  readonly requestedNetwork: XONetwork;

  constructor(openNetwork: XONetwork, requestedNetwork: XONetwork) {
    super(
      `XO is already connected to ${openNetwork} in this tab. Reload the page to build on ${requestedNetwork}. The classic builder can build this settlement without reloading.`,
    );
    this.name = "XoEngineNetworkError";
    this.openNetwork = openNetwork;
    this.requestedNetwork = requestedNetwork;
  }
}

type Session = {
  network: XONetwork;
  engine: Engine;
  templateIdentifier: string;
};

let session: Session | null = null;
let opening: Promise<Session> | null = null;

export function xoSessionNetwork(): XONetwork | null {
  return session?.network ?? null;
}

/**
 * One engine per tab. `@xo-cash/engine` 0.1.1-next.18029697917 keeps a single
 * Electrum cache for the process, so a second Engine.create on another
 * network throws "Cannot configure storage for cache after it has been initialized."
 */
export async function openXoSession(
  network: NetworkId,
  options?: { mnemonic?: string; databasePath?: string },
): Promise<Session> {
  const requested = xoNetwork(network);
  if (session) {
    if (session.network !== requested) throw new XoEngineNetworkError(session.network, requested);
    return session;
  }
  if (opening) {
    const pending = await opening;
    if (pending.network !== requested) throw new XoEngineNetworkError(pending.network, requested);
    return pending;
  }
  opening = startSession(requested, options);
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

export async function stopXoSession(): Promise<void> {
  const current = session;
  session = null;
  if (current) {
    try {
      await current.engine.stop();
    } catch {
      // engine.stop rejects with an empty AggregateError on this engine release.
    }
  }
  try {
    await stopElectrumNetwork();
  } catch {
    // The socket may already be closed.
  }
}

async function startSession(
  network: XONetwork,
  options: { mnemonic?: string; databasePath?: string } | undefined,
): Promise<Session> {
  const databasePath = await nodeDatabasePath(options?.databasePath);
  const engine = await Engine.create(coordinatorMnemonic(options?.mnemonic), {
    network,
    storageType: StorageType.INDEXEDDB,
    ...(databasePath ? { databasePath, databaseFilename: "settlemany" } : {}),
  });
  const imported = await engine.importTemplate(settlemanyTemplate);
  session = { network, engine, templateIdentifier: imported.templateIdentifier };
  return session;
}

function xoNetwork(network: NetworkId): XONetwork {
  return network === "chipnet" ? XO_SUPPORTED_NETWORKS.chipnet : XO_SUPPORTED_NETWORKS.mainnet;
}

/**
 * The coordinator mnemonic only signs XO invitation commits. It is generated
 * in the browser and stored locally so the same engine can reopen an
 * invitation. It is not a funding seed and it is not in the repository.
 */
function coordinatorMnemonic(explicit: string | undefined): string {
  if (explicit) return explicit;
  try {
    const existing = localStorage.getItem(COORDINATOR_KEY);
    if (existing) return existing;
    const phrase = generateBip39Mnemonic();
    localStorage.setItem(COORDINATOR_KEY, phrase);
    return phrase;
  } catch {
    return generateBip39Mnemonic();
  }
}

async function nodeDatabasePath(explicit: string | undefined): Promise<string | undefined> {
  if (typeof window !== "undefined") return explicit;
  // Node-only. The browser returns above, and these specifiers stay out of the client bundle.
  const fs = await import(/* @vite-ignore */ "node:fs");
  const path = await import(/* @vite-ignore */ "node:path");
  const os = await import(/* @vite-ignore */ "node:os");
  const directory = explicit ?? path.join(os.tmpdir(), "settlemany-xo");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
