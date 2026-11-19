# Soroban frontend examples

These browser-side TypeScript examples use `@stellar/stellar-sdk` and the Freighter browser extension. They connect the user's wallet, simulate contract calls, request wallet signing, submit transactions to Soroban RPC, and report failures. The royalty query is read-only and uses RPC simulation.

## Configuration

Copy `.env.example` into the frontend application's environment file and set `VITE_SOROBAN_NFT_CONTRACT_ID` to the deployed contract for the selected network. `VITE_STELLAR_NETWORK` accepts `testnet` or `public`; use testnet while developing. `VITE_SOROBAN_RPC_URL` is optional and defaults to the matching Stellar RPC endpoint. These values are public and must not contain private keys, secret seeds, or signing material.

Install the Stellar SDK in the consuming frontend (`npm install @stellar/stellar-sdk`) and install/unlock Freighter. The example expects the extension's `window.freighterApi` provider. The connected wallet must be on the same network as the configured contract and have an account funded/activated on that network. The wallet prompts for transaction approval; private keys remain in the wallet.

## Examples

- `mint.ts` connects the wallet and invokes `mint` with the recipient, token ID, metadata URI, and royalty basis points.
- `transfer.ts` invokes the backend's current contract method `transfer_with_royalty` with token ID, sender, recipient, sale price in contract units, and royalty basis points.
- `royalty-query.ts` simulates `get_royalties(token_id)` and decodes the returned address-to-basis-points map.

Contract ABI note: the repository has no contract source or generated TypeScript bindings. Its mint preparation service describes a four-argument `mint` call, while a binding test describes a different three-argument call. This example follows the mint preparation service's fields; verify the deployed contract ABI before submitting mint transactions. The transfer and royalty method names and argument types follow the backend's current Soroban calls.

## Compile check

From the repository root, run:

```sh
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck contracts/examples/*.ts
```