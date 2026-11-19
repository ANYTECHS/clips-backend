import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';

const DUMMY_SOURCE = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

/**
 * Thin helper for read-only simulations and unsigned tx preparation against
 * the NFT royalty Soroban contract.
 */
@Injectable()
export class SorobanContractService {
  readonly contractId =
    process.env.SOROBAN_NFT_CONTRACT_ID ||
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

  constructor(private readonly stellar: StellarService) {}

  private server() {
    return new StellarSdk.rpc.Server(this.stellar.rpcUrl);
  }

  private build(source: any, method: string, args: any[]) {
    const contract = new StellarSdk.Contract(this.contractId);
    return new StellarSdk.TransactionBuilder(source, {
      fee: '100',
      networkPassphrase: this.stellar.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(300)
      .build();
  }

  /** Simulate a read-only call and return the native JS value. */
  async read<T>(method: string, args: any[] = []): Promise<T> {
    let sim: any;
    try {
      sim = await this.server().simulateTransaction(
        this.build(new StellarSdk.Account(DUMMY_SOURCE, '0'), method, args),
      );
    } catch (err) {
      throw new ServiceUnavailableException(
        `Soroban RPC unavailable: ${(err as Error).message}`,
      );
    }
    if (StellarSdk.rpc.Api.isSimulationError(sim) || !sim.result?.retval) {
      throw new InternalServerErrorException(
        `Contract call ${method} failed: ${sim.error ?? 'no result'}`,
      );
    }
    return StellarSdk.scValToNative(sim.result.retval) as T;
  }

  /** Build + prepare an unsigned transaction XDR for the caller to sign. */
  async prepare(
    sourceAddress: string,
    method: string,
    args: any[],
  ): Promise<{ xdr: string; simulatedResult: unknown }> {
    const server = this.server();
    const account = await server.getAccount(sourceAddress);
    const tx = this.build(account, method, args);
    const sim: any = await server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new InternalServerErrorException(
        `Contract call ${method} would fail: ${sim.error}`,
      );
    }
    const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build();
    return {
      xdr: prepared.toXDR(),
      simulatedResult: sim.result?.retval
        ? StellarSdk.scValToNative(sim.result.retval)
        : null,
    };
  }
}
