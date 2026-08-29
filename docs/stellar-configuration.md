# Stellar configuration

This backend reads Stellar and Soroban settings from environment variables at runtime. These variables drive network selection, Horizon queries, wallet validation, payout operations, and Soroban NFT minting.

Important:
- Use safe placeholders in docs, examples, and Swagger snippets.
- Never expose real private keys, secret seeds, or signing material in API examples or logs.
- Separate testnet and production values explicitly.

## 1) Network selection

### Required

```env
STELLAR_NETWORK="testnet"
```

Supported values:
- `testnet` — development and staging
- `public` — production / mainnet

The backend defaults to `testnet` when unset in `StellarService`.

### Network behavior

- `testnet` uses:
  - Horizon: `https://horizon-testnet.stellar.org`
  - Soroban RPC: `https://soroban-testnet.stellar.org`
  - Network passphrase: `Test SDF Network ; September 2015`
- `public` uses:
  - Horizon: `https://horizon.stellar.org`
  - Soroban RPC: `https://soroban-rpc.stellar.org`
  - Network passphrase: `Public Global Stellar Network ; September 2015`

Use `STELLAR_NETWORK=public` only in production or when you intentionally want mainnet behavior.

## 2) Horizon configuration

### Required for Horizon-based wallet and transaction lookups

```env
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
```

Notes:
- This is typically auto-defaulted when `STELLAR_NETWORK` is set.
- It is used by wallet balance checks, payout confirmation polling, and transaction status queries.
- In production, this should point to the public Horizon endpoint.

### Polling fallback

```env
STELLAR_POLL_INTERVAL_MS=10000
```

This controls how often the app polls Horizon when streaming is unavailable.

## 3) Wallet and platform addresses

### Platform wallet addresses

```env
STELLAR_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
PLATFORM_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

Notes:
- These are public Stellar addresses.
- They are used for receiving subscription payments, platform payouts, and royalty distribution.
- These values are not secrets.
- Use placeholders such as `G...` in documentation and Swagger examples.

### Receiver address for payment listeners

```env
STELLAR_RECEIVER_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

This address is used by Stellar payment listeners for incoming payment validation. It is typically the same public address as the platform wallet.

### Secret / signing material

```env
STELLAR_PLATFORM_SECRET="REPLACE_WITH_PLATFORM_SECRET"
```

Important:
- `STELLAR_PLATFORM_SECRET` is a secret and must never be included in Swagger examples, logs, or public docs.
- Only store real secret values in a secure environment secret manager or a local `.env` file that is not committed to source control.
- In public documentation, use a placeholder such as `REPLACE_WITH_PLATFORM_SECRET`.

## 4) Asset configuration

```env
STELLAR_ASSET_CODE="XLM"
STELLAR_ASSET_ISSUER=""
```

Behavior:
- `STELLAR_ASSET_CODE=XLM` means native XLM is used.
- `STELLAR_ASSET_ISSUER` is only required for non-native assets such as USDC or custom asset contracts.
- Leave it blank for XLM.

Example for a custom asset:

```env
STELLAR_ASSET_CODE="USDC"
STELLAR_ASSET_ISSUER="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

This is used when the app needs to validate credit or payment asset conditions.

## 5) Subscription pricing

These values are used for Stellar subscription plan pricing in asset units.

```env
STELLAR_PLAN_BASIC_AMOUNT=5
STELLAR_PLAN_PRO_AMOUNT=15
STELLAR_PLAN_ELITE_AMOUNT=30
```

Notes:
- These amounts correspond to the configured asset code and network.
- For XLM, they represent XLM amounts.
- For asset-backed flows, the asset code and issuer must match the actual supported asset.

## 6) Soroban / RPC configuration

### Required for NFT minting and Soroban contract interactions

```env
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
SOROBAN_NFT_CONTRACT_ID="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4"
```

Notes:
- `SOROBAN_RPC_URL` points to the Soroban RPC endpoint for the selected network.
- `SOROBAN_NFT_CONTRACT_ID` is the deployed NFT contract ID used for minting and royalty queries.
- This value must be set for contract-based NFT flows.
- Use a valid contract ID placeholder in docs; do not use a real production ID in examples.

Use these values with the appropriate network:
- Testnet: `https://soroban-testnet.stellar.org`
- Mainnet: `https://soroban-rpc.stellar.org`

## 7) Royalty and platform configuration

These variables affect royalty distribution and the NFT contract configuration.

```env
PLATFORM_ROYALTY_BPS=100
CREATOR_ROYALTY_BPS=1000
ROYALTY_ASSET_CODE="native"
ROYALTY_ASSET_CONTRACT_ID=""
```

Notes:
- `PLATFORM_ROYALTY_BPS` is the platform share in basis points.
- `CREATOR_ROYALTY_BPS` is the creator share in basis points.
- `ROYALTY_ASSET_CODE` defaults to `native` when not set.
- `ROYALTY_ASSET_CONTRACT_ID` is required only when paying royalties in a custom Soroban asset contract.

## 8) Production vs testnet guidance

### Testnet configuration example

```env
STELLAR_NETWORK="testnet"
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
PLATFORM_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_RECEIVER_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_ASSET_CODE="XLM"
STELLAR_ASSET_ISSUER=""
SOROBAN_NFT_CONTRACT_ID="CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

Use this configuration for local development, staging, and integration tests.

### Production configuration example

```env
STELLAR_NETWORK="public"
STELLAR_HORIZON_URL="https://horizon.stellar.org"
SOROBAN_RPC_URL="https://soroban-rpc.stellar.org"
PLATFORM_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_RECEIVER_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_ASSET_CODE="XLM"
STELLAR_ASSET_ISSUER=""
SOROBAN_NFT_CONTRACT_ID="CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

Use this configuration only in production with real addresses and a properly deployed contract ID.

## 9) APIs and flows affected by Stellar configuration

The following API areas depend on Stellar configuration:
- wallet balance and validation endpoints
- payout initiation and confirmation flows
- NFT mint creation and royalty queries
- subscription payment verification and webhook processing
- transaction status lookups against Horizon

These endpoints should not show real account secrets or signing keys in Swagger examples.

## 10) Security rules

- Do not include real private keys, seed phrases, or secret values in Swagger examples.
- Do not log secret values from environment variables.
- Keep `STELLAR_PLATFORM_SECRET` out of public documentation.
- Prefer placeholders like `G...`, `CA...`, `REPLACE_WITH_*`, or `your_...` in examples.
- Keep production runtime values in secure secret storage rather than source-controlled files.

## 11) Minimal safe example set

```env
STELLAR_NETWORK="testnet"
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
STELLAR_RECEIVER_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
PLATFORM_WALLET_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_ASSET_CODE="XLM"
STELLAR_ASSET_ISSUER=""
STELLAR_POLL_INTERVAL_MS=10000
STELLAR_PLAN_BASIC_AMOUNT=5
STELLAR_PLAN_PRO_AMOUNT=15
STELLAR_PLAN_ELITE_AMOUNT=30
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
SOROBAN_NFT_CONTRACT_ID="CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
STELLAR_PLATFORM_SECRET="REPLACE_WITH_PLATFORM_SECRET"
```

This is the safest documentation baseline for local dev and QA; production values must be replaced with the correct real values and secret material stored securely.
