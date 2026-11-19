# API Error Codes

All error responses from the ClipCash API follow the standard [`ApiResponseDto`](../src/common/dtos/api-response.dto.ts) envelope:

```json
{
  "statusCode": 400,
  "message": "Human-readable explanation",
  "error": "Error detail or code",
  "timestamp": "2026-08-29T16:50:25.156Z"
}
```

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | OK — request succeeded |
| `201` | Created — resource created |
| `400` | Bad Request — validation failed or business rule violated |
| `401` | Unauthorized — missing or invalid JWT |
| `403` | Forbidden — authenticated but not authorised |
| `404` | Not Found — resource does not exist or belongs to another user |
| `409` | Conflict — duplicate resource or conflicting state |
| `422` | Unprocessable Entity — request is valid but cannot be processed (e.g. blockchain rejection) |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error — unexpected server error |
| `503` | Service Unavailable — dependent service (Soroban RPC, Pinata) is unreachable |

## Wallet Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `WALLET_INVALID_ADDRESS` | 400 | Address format does not match declared chain |
| `WALLET_INVALID_SIGNATURE` | 400 | Signature verification failed |
| `WALLET_EXPIRED_MESSAGE` | 400 | Timestamp in `signedMessage` is > 5 minutes old |
| `WALLET_INVALID_MESSAGE_FORMAT` | 400 | `signedMessage` does not match expected format |
| `WALLET_NOT_FOUND` | 404 | No wallet with that ID for the authenticated user |
| `WALLET_ALREADY_CONNECTED` | 409 | Address already linked to a different user |
| `WALLET_HAS_PENDING_MINT` | 409 | Cannot disconnect — pending mint references this wallet |

## NFT Mint Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `MINT_CLIP_ALREADY_POSTED` | 400 | `postStatus === 'posted'`; minting auto-posted clips is blocked |
| `MINT_INVALID_ROYALTY_BPS` | 400 | `royaltyBps` is out of range (0–1500) |
| `MINT_ALREADY_MINTED` | 400 | Clip already has a confirmed `mintTxHash` |
| `MINT_INVALID_XDR` | 400 | `signedXdr` is not a valid transaction envelope |
| `MINT_XDR_NOT_SIGNED` | 400 | XDR contains no signatures |
| `MINT_WRONG_TRANSACTION` | 400 | XDR does not match the prepare-time transaction |
| `MINT_TRANSACTION_REJECTED` | 422 | Stellar network rejected the transaction |
| `IPFS_UPLOAD_FAILED` | 503 | Pinata upload failed |
| `SOROBAN_BUILD_FAILED` | 503 | XDR construction failed |
| `SOROBAN_SUBMIT_FAILED` | 503 | Soroban RPC unreachable |

## Payout Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `PAYOUT_INSUFFICIENT_BALANCE` | 400 | Requested amount exceeds available balance |
| `PAYOUT_BELOW_MINIMUM` | 400 | Amount is below `MIN_STELLAR_PAYOUT` threshold |
| `PAYOUT_ABOVE_MAXIMUM` | 400 | Amount exceeds `MAX_PAYOUT_USD` |
| `PAYOUT_NOT_FOUND` | 404 | Payout record not found |
| `PAYOUT_INVALID_STATUS` | 409 | Cannot perform action in current payout status |

## Auth Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Email/password do not match |
| `AUTH_EMAIL_NOT_VERIFIED` | 401 | Account exists but email not confirmed |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT has expired |
| `AUTH_TOKEN_INVALID` | 401 | JWT cannot be decoded or has invalid signature |
| `AUTH_BRUTE_FORCE_LOCKED` | 429 | Too many failed login attempts; account temporarily locked |
