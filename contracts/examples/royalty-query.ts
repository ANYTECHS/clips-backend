/**
 * Royalty query examples.
 *  1. On-chain read-only call (simulation, no signing / fees).
 *  2. Backend REST: GET /nft/{mintAddress}/royalty (see Swagger "nft" tag).
 */
import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import { config, describeError, server } from './config';

// Any valid account id works as the simulation source; nothing is signed.
const SIM_SOURCE = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

export async function getDefaultRoyaltyBps(): Promise<number | null> {
  const tx = new TransactionBuilder(new Account(SIM_SOURCE, '0'), {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(config.contractId).call('get_default_royalty_bps'))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Royalty query failed: ${describeError(sim.error)}`);
  }
  const value = sim.result ? scValToNative(sim.result.retval) : null;
  return value === undefined ? null : (value as number | null);
}

/** Response shape documented in Swagger for GET /nft/{mintAddress}/royalty. */
export async function getRoyaltyFromApi(mintAddress: string, accessToken: string) {
  const res = await fetch(
    `${config.apiBaseUrl}/nft/${encodeURIComponent(mintAddress)}/royalty`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Royalty API error ${res.status}: ${await res.text()}`);
  return res.json();
}
