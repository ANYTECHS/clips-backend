# Soroban NFT frontend examples

| File | Shows |
|------|-------|
| `config.ts` | env config, wallet connection, signing, submission, error mapping |
| `mint.ts` | admin-signed `mint` |
| `transfer.ts` | owner-signed `transfer` |
| `royalty-query.ts` | read-only `get_default_royalty_bps` + `GET /nft/{mintAddress}/royalty` |

## Setup
1. `npm i @stellar/stellar-sdk @stellar/freighter-api`
2. Copy `.env.example` to `.env` and set `NFT_CONTRACT_ID`.
3. Set the wallet (e.g. Freighter) to the same network as `STELLAR_NETWORK` and fund the account (testnet: Friendbot).

```ts
import * as freighter from '@stellar/freighter-api';
import { transferClipNft } from './transfer';
await transferClipNft(freighter as any, 'G...RECIPIENT', 1n);
```

No private keys are used; all signing happens in the wallet. Typecheck with
`npx tsc --noEmit --strict --module commonjs --target es2020 --lib es2020,dom --skipLibCheck contracts/examples/*.ts`.
