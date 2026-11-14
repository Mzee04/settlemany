import type { Output, TransactionCommon } from "@bitauth/libauth";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { buildPaytacaSignRequest, indexFromSession, pathsFromSession } from "./paytaca.ts";
import { mergeWalletSignature } from "./sign.ts";

export async function signWithWallet(args: {
  manager: DappConnectionManager;
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputIndexes: number[];
  prompt: string;
}): Promise<TransactionCommon> {
  const sessionPaths = pathsFromSession(args.manager.getSessionPaths());
  if (sessionPaths.length === 0) {
    throw new Error("The wallet has not shared a receive or change xpub yet. Reconnect WizardConnect and try again.");
  }
  const request = buildPaytacaSignRequest({
    transaction: args.transaction,
    sourceOutputs: args.sourceOutputs,
    signerIndexes: args.inputIndexes,
    userPrompt: args.prompt,
    locate: (lockingBytecode) =>
      indexFromSession(
        {
          paths: sessionPaths,
          getPubkey: (childIndex, index) => args.manager.getPubkey(childIndex, index),
        },
        lockingBytecode,
      ),
  });
  const response = await args.manager.signTransaction(request);
  if (response.error || !response.signedTransaction) {
    throw new Error(response.error || "The wallet returned no signature.");
  }
  return mergeWalletSignature({
    base: args.transaction,
    signedHex: response.signedTransaction,
    inputIndexes: args.inputIndexes,
  });
}
