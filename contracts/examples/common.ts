import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';

declare global {
  interface ImportMetaEnv {
    readonly VITE_STELLAR_NETWORK?: 'testnet' | 'public';
    readonly VITE_SOROBAN_RPC_URL?: string;
    readonly VITE_SOROBAN_NFT_CONTRACT_ID?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    freighterApi?: {
      requestAccess(): Promise<{ address: string }>;
      signTransaction(
        transactionXdr: string,
        options: { networkPassphrase: string; address: string },
      ): Promise<string | { signedTxXdr?: string; error?: string }>;
    };
  }
}

const NETWORK = import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet';

export const NETWORK_PASSPHRASE =
  NETWORK === 'public'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

const RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL ??
  (NETWORK === 'public'
    ? 'https://soroban-rpc.stellar.org'
    : 'https://soroban-testnet.stellar.org');

export const CONTRACT_ID = import.meta.env.VITE_SOROBAN_NFT_CONTRACT_ID;

export function getContract(): Contract {
  if (!CONTRACT_ID) {
    throw new Error('Set VITE_SOROBAN_NFT_CONTRACT_ID before running an example.');
  }
  return new Contract(CONTRACT_ID);
}

export function getRpcServer(): rpc.Server {
  return new rpc.Server(RPC_URL);
}

export async function connectWallet(): Promise<string> {
  const freighter = window.freighterApi;
  if (!freighter) {
    throw new Error('Freighter is not available. Install and unlock the extension.');
  }

  const { address } = await freighter.requestAccess();
  if (!address) {
    throw new Error('Freighter did not return a Stellar account address.');
  }
  return address;
}

async function simulateOperation(
  operation: ReturnType<Contract['call']>,
  sourceAddress: string,
) {
  const server = getRpcServer();
  const sourceAccount = await server.getAccount(sourceAddress);
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if ('error' in simulation) {
    throw new Error(`Soroban simulation failed: ${simulation.error}`);
  }
  return { server, transaction, simulation };
}

export async function signAndSubmit(
  operation: ReturnType<Contract['call']>,
  sourceAddress: string,
): Promise<string> {
  const { server, transaction, simulation } = await simulateOperation(
    operation,
    sourceAddress,
  );
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  const freighter = window.freighterApi;
  if (!freighter) {
    throw new Error('Freighter is not available. Install and unlock the extension.');
  }

  const signedResult = await freighter.signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: sourceAddress,
  });
  if (typeof signedResult !== 'string' && signedResult.error) {
    throw new Error(`Freighter could not sign the transaction: ${signedResult.error}`);
  }
  const signedXdr =
    typeof signedResult === 'string' ? signedResult : signedResult.signedTxXdr;
  if (!signedXdr) {
    throw new Error('Freighter returned no signed transaction XDR.');
  }

  const signedTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE,
  );
  const submission = await server.sendTransaction(signedTransaction);
  if (submission.status === 'ERROR') {
    throw new Error(`Soroban RPC rejected the transaction: ${submission.status}`);
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(submission.hash);
    if (result.status === 'SUCCESS') return submission.hash;
    if (result.status === 'FAILED') {
      throw new Error(`Transaction ${submission.hash} failed on-chain.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Transaction ${submission.hash} is still pending. Check the explorer.`);
}

export async function simulateRead(
  operation: ReturnType<Contract['call']>,
  sourceAddress: string,
): Promise<xdr.ScVal> {
  const { simulation } = await simulateOperation(
    operation,
    sourceAddress,
  );
  const returnValue = simulation.results?.[0]?.xdr;
  if (!returnValue) {
    throw new Error('Soroban read returned no value.');
  }
  return xdr.ScVal.fromXDR(returnValue, 'base64');
}

export { nativeToScVal };

export async function reportExampleError<T>(
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error(`${name} failed:`, error);
    throw error;
  }
}