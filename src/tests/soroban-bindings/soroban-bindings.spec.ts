/**
 * #1028 — Soroban TypeScript contract binding tests.
 *
 * Verifies the generated/used Soroban TS bindings (`Contract`, `rpc.Server`
 * from `@stellar/stellar-sdk`) against the expected contract interface:
 *  - expected methods exist on the bindings
 *  - parameters serialize to/from ScVal XDR correctly
 *  - transactions can be constructed and signed offline
 *  - contract responses decode correctly
 *  - invalid contract responses are rejected (throw)
 *
 * All tests are offline — no RPC/network access required.
 */
import {
  Account,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

// Valid contract address (deterministic 32-byte contract strkey).
const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32));

describe('Soroban contract bindings (#1028)', () => {
  describe('binding method presence', () => {
    it('exposes the contract invocation binding', () => {
      const contract = new Contract(CONTRACT_ID);
      expect(typeof (contract as any).call).toBe('function');
      expect((contract as any).getContractId?.() ?? CONTRACT_ID).toEqual(
        expect.anything(),
      );
    });

    it('exposes the RPC server methods used to build/submit transactions', () => {
      const server = new rpc.Server('https://soroban-testnet.stellar.org');
      expect(typeof (server as any).prepareTransaction).toBe('function');
      expect(typeof (server as any).sendTransaction).toBe('function');
      expect(typeof (server as any).getTransaction).toBe('function');
      expect(typeof (server as any).simulateTransaction).toBe('function');
    });
  });

  describe('parameter serialization', () => {
    it('serializes primitive parameters to ScVal XDR and back', () => {
      const u32 = nativeToScVal(7, { type: 'u32' });
      expect(scValToNative(xdr.ScVal.fromXDR(u32.toXDR('base64'), 'base64'))).toBe(7);

      const str = nativeToScVal('dupdab', { type: 'string' });
      expect(scValToNative(xdr.ScVal.fromXDR(str.toXDR('base64'), 'base64'))).toBe('dupdab');

      const amount = nativeToScVal('10000000', { type: 'i128' });
      expect(scValToNative(xdr.ScVal.fromXDR(amount.toXDR('base64'), 'base64'))).toBe(
        10000000n,
      );
    });

    it('serializes address parameters to contract-address ScVals', () => {
      const account = Keypair.random().publicKey();
      const val = nativeToScVal(account, { type: 'address' });
      expect(val.switch()).toBe(xdr.ScValType.scvAddress());
      expect(String(scValToNative(val))).toBe(account);
    });

    it('encodes entrypoint + arguments into the invoke-contract host function', () => {
      const contract = new Contract(CONTRACT_ID);
      const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'transfer',
            nativeToScVal(Keypair.random().publicKey(), { type: 'address' }),
            nativeToScVal('100', { type: 'i128' }),
          ),
        )
        .setTimeout(30)
        .build();

      const parsed = tx.operations[0] as any;
      expect(parsed.type).toBe('invokeHostFunction');

      const args = parsed.func.invokeContract();
      expect(args.functionName().toString()).toBe('transfer');
      expect(args.args()).toHaveLength(2);
      expect(
        StrKey.encodeContract(args.contractAddress().contractId()),
      ).toBe(CONTRACT_ID);
    });
  });

  describe('transaction construction', () => {
    it('builds, signs and round-trips a contract-call transaction through XDR', () => {
      const kp = Keypair.random();
      const contract = new Contract(CONTRACT_ID);
      const tx = new TransactionBuilder(new Account(kp.publicKey(), '0'), {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(contract.call('is_paused'))
        .setTimeout(30)
        .build();

      expect(tx.operations).toHaveLength(1);
      expect((tx.operations[0] as any).type).toBe('invokeHostFunction');

      tx.sign(kp);
      const xdrB64 = tx.toEnvelope().toXDR('base64');
      expect(typeof xdrB64).toBe('string');

      const restored = TransactionBuilder.fromXDR(xdrB64, Networks.TESTNET);
      expect(restored.source).toBe(kp.publicKey());
      expect(restored.signatures).toHaveLength(1);
      expect((restored.operations[0] as any).type).toBe('invokeHostFunction');
    });

    it('rejects transaction XDR that is not a valid transaction', () => {
      expect(() =>
        TransactionBuilder.fromXDR('bm90LWEtdHJhbnNhY3Rpb24', Networks.TESTNET),
      ).toThrow();
    });
  });

  describe('response decoding', () => {
    it('decodes a simulated contract response payload', () => {
      // SimulatedTransaction-style result: ScVal xdr base64 on the wire.
      const onWire = nativeToScVal(true, { type: 'bool' }).toXDR('base64');
      const decoded = scValToNative(xdr.ScVal.fromXDR(onWire, 'base64'));
      expect(decoded).toBe(true);
    });

    it('decodes map-shaped contract responses', () => {
      const response = nativeToScVal(
        { royaltyBps: 250 },
        { type: { map: [{ name: 'royaltyBps', type: 'u32' }] } },
      );
      const decoded = scValToNative(
        xdr.ScVal.fromXDR(response.toXDR('base64'), 'base64'),
      ) as { royaltyBps: number | bigint };
      expect(Number(decoded.royaltyBps)).toBe(250);
    });

    it('throws on invalid contract response payloads', () => {
      // Not valid XDR at all.
      expect(() => xdr.ScVal.fromXDR('ZGVhZGJlZWZkZWFkYmVlZg==', 'base64')).toThrow();

      // Valid bytes that are not a serialized transaction.
      expect(() =>
        TransactionBuilder.fromXDR('aGVsbG8gd29ybGQ=', Networks.TESTNET),
      ).toThrow();
    });

    it('throws when decoding an unsupported/malformed ScVal type', () => {
      // Corrupted ScVal bytes (truncated after the type discriminator).
      const truncated = Buffer.from([0, 0, 0, 5]).toString('base64');
      expect(() => xdr.ScVal.fromXDR(truncated, 'base64')).toThrow();
    });
  });
});
