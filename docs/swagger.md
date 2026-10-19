# Swagger / OpenAPI Documentation

Swagger UI is served at `/api/docs` in non-production environments (or when
`ENABLE_SWAGGER_UI=true`). Authenticate with **Authorize** using a JWT
(`access-token` bearer scheme).

## Sections (tags)

| Tag | Covers |
|-----|--------|
| `Authentication` | Authentication and authorization |
| `Users` | User profile management |
| `Videos` | Video upload and management |
| `Clips` | Clip generation and management |
| `Wallets` | Stellar wallet connection |
| `NFTs` | NFT minting, collections, and royalties |
| `Subscriptions` | Subscription plans and lifecycle |
| `Payments` | Fiat and Stellar subscription payments |
| `Payouts` | Payout requests, methods, status, and history |
| `Admin` | Admin-only endpoints |
| `earnings` | Earnings summary, history, exports |
| `Webhooks` | Inbound webhooks from external services |

Add `@ApiTags('<tag>')` to every controller and register new tags in
`src/main.ts` via `DocumentBuilder.addTag()`.

## Standard error responses

All errors share `ErrorResponseDto` (`src/common/dtos/error-response.dto.ts`):

```json
{
  "statusCode": 400,
  "message": "Invalid request",
  "error": "Bad Request",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Use the `ApiStandardErrors` decorator
(`src/common/decorators/api-standard-errors.decorator.ts`) instead of ad-hoc
error decorators:

```ts
@ApiStandardErrors()           // 400, 401, 403, 429, 500
@Controller('payouts')
export class PayoutsController {
  @Get(':id')
  @ApiStandardErrors(404)      // add endpoint-specific statuses
  findOne() {}
}
```

Supported statuses: `400`, `401`, `403`, `404`, `409`, `429`, `500`.

## Endpoint checklist

Each public endpoint should declare:

- `@ApiOperation({ summary, description })`
- Request schema — DTO with `@ApiProperty({ example, description, enum })`
- Response schema — `@ApiResponse({ status, type | schema })` with an example
- Authentication — `@ApiBearerAuth('access-token')` for protected routes
- Error responses — `@ApiStandardErrors(...)`

## Pagination

List endpoints return `PaginatedResponseDto` (`src/common/dtos/api-response.dto.ts`):

```json
{
  "items": [],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPrevPage": false
}
```
