# API Error Codes and Handling

This document provides a comprehensive guide to error handling in the ClipCash API. It outlines the standard error response formats, HTTP status codes, and custom machine-readable error codes returned by the backend.

---

## Error Response Formats

The ClipCash API returns errors in standardized JSON formats to make handling them straightforward for client applications. Depending on the type of error, the payload will follow one of the schemas below.

### 1. Standard API Error Response
Used for most standard errors (e.g., authentication failures, forbidden resources, resource-not-found).

```json
{
  "statusCode": 401,
  "message": "Authentication required",
  "error": "Unauthorized",
  "reason": "jwt malformed",
  "errorCode": "UNAUTHORIZED"
}
```

| Field | Type | Description |
|---|---|---|
| `statusCode` | `number` | The HTTP status code corresponding to the error. |
| `message` | `string` | A human-readable message describing the error. |
| `error` | `string` | The standard HTTP error name. |
| `reason` | `string` | *(Optional)* Detailed technical reason (e.g., token expiration, specific validation constraint). |
| `errorCode` | `string` | *(Optional)* A machine-readable custom code for programmatic handling (e.g. `TOKEN_EXPIRED`). |

### 2. File Upload & Media Validation Error Response
Specifically used by the video upload controller and services to return validation and upload errors.

```json
{
  "status": "error",
  "message": "File too large. Maximum size is 500 MB",
  "code": "FILE_TOO_LARGE"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Fixed value `"error"` to denote a failed operation. |
| `message` | `string` | A human-readable description of the validation or upload failure. |
| `code` | `string` | A machine-readable error code (e.g., `INVALID_FORMAT`, `FILE_TOO_LARGE`). |

### 3. Input Validation Error Response
Returned by the NestJS global validation pipes when payload validation fails (HTTP 400 Bad Request).

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": {
    "email": [
      "email must be an email"
    ],
    "password": [
      "password must be longer than or equal to 8 characters"
    ]
  },
  "error": "Validation Error"
}
```

| Field | Type | Description |
|---|---|---|
| `statusCode` | `number` | Always `400`. |
| `message` | `string` | Always `"Validation failed"`. |
| `errors` | `object` | An object mapping request payload fields to lists of validation constraint messages. |
| `error` | `string` | Always `"Validation Error"`. |

---

## Custom Error Codes Reference

Below is a detailed list of machine-readable error codes returned in either the `errorCode` or `code` fields of responses.

| Code | HTTP Status | Description | Recommended Mitigation / Recovery |
|---|---|---|---|
| **`UNAUTHORIZED`** | `401 Unauthorized` | Request is missing authentication headers or the JWT token is malformed/invalid. | Retrieve a valid access token or redirect the user to login. |
| **`TOKEN_EXPIRED`** | `401 Unauthorized` | The provided JWT access or refresh token has expired. | Request a new access token via `/auth/refresh` using the refresh token. |
| **`FORBIDDEN`** | `403 Forbidden` | The user is authenticated but does not have the roles (e.g. `admin`) or ownership privileges for the resource. | Show an "Access Denied" message; request user roles elevation if applicable. |
| **`FILE_TOO_LARGE`** | `400 Bad Request` | Uploaded video file size exceeds the platform limit of 500 MB. | Inform the user of the size limit; ask them to compress or split the video. |
| **`INVALID_FORMAT`** | `400 Bad Request` | The video extension or MIME type is not allowed (only `.mp4`, `.mov`, `.avi`, `.webm` are supported). | Alert the user and request they convert the file to a supported format. |
| **`DURATION_EXCEEDED`** | `400 Bad Request` | The video duration exceeds the maximum limit of 4 hours. | Suggest trimming the video to less than 4 hours before re-uploading. |
| **`UPLOAD_FAILED`** | `400 Bad Request` / `500 Internal` | The upload processing failed, could be due to missing multipart file field or server disk write issues. | Ensure the request includes a valid `file` key as `multipart/form-data` and retry. |

---

## Standard Exception Classes

The backend utilizes custom exception classes extending NestJS's `HttpException` to standardize errors. If you are developing features, please instantiate and throw these classes:

*   **`BadRequestException(message, code?)`** — Standard 400 Bad Request.
*   **`ConflictException(message, code?)`** — Standard 409 Conflict (e.g. wallet already exists for user).
*   **`NotFoundException(message, resourceType?, resourceId?)`** — Standard 404 Not Found. Serializes the type and ID of the missing resource.
*   **`ServiceUnavailableException(message, serviceName?)`** — Standard 503 Service Unavailable (e.g., Horizon / Soroban RPC down).
*   **`UnauthorizedException(message, reason?)`** — Standard 401 Unauthorized.
*   **`ValidationException(message, errors?)`** — Custom input validation exception.
*   **`InternalServerErrorException(message, code?)`** — Standard 500 Internal Server Error.

---

## System-Level & Infrastructure Errors

### 1. Global API Rate Limiting (Throttler)
When exceeding request rate limits configured in `src/app.module.ts`:

*   **HTTP Status:** `429 Too Many Requests`
*   **Response Body:**
    ```json
    {
      "statusCode": 429,
      "message": "ThrottlerException: Too Many Requests",
      "error": "Too Many Requests"
    }
    ```
*   **Mitigation:** Wait for the rate-limit window to reset (refer to response headers: `X-RateLimit-Reset`). See [docs/rate-limits.md](./rate-limits.md) for more details.

### 2. Queue Concurrency Rate Limiting
Enforced when users submit too many background jobs concurrently:

*   **HTTP Status:** `429 Too Many Requests`
*   **Response Body:**
    ```json
    {
      "statusCode": 429,
      "message": "Too many active jobs. Maximum 10 concurrent jobs allowed per user.",
      "queue": "clip-generation"
    }
    ```
*   **Mitigation:** Wait for current active clip generation or NFT minting jobs to complete before queuing new ones.

### 3. CSRF Verification Failures
Enforced by the CSRF guard on modifying HTTP requests:

*   **HTTP Status:** `403 Forbidden`
*   **Response Body:**
    ```json
    {
      "statusCode": 403,
      "message": "Invalid CSRF token",
      "error": "Forbidden"
    }
    ```
*   **Mitigation:** Ensure the `x-csrf-token` header is properly populated with the token obtained from the handshake cookie.

### 4. Blockchain & Wallet Specific Errors
Errors occurring during Stellar smart contract interactions or transaction submissions:

*   **User rejected transaction:** The client wallet application refused signature. (Mitigate by restarting Freighter/Albedo sign prompts).
*   **Circuit breaker open - Soroban RPC unavailable:** The RPC node is down. Returns a standard `503 Service Unavailable` with `service: "Soroban RPC"`. (Mitigate with retry backoff).
*   **Insufficient funds:** Wallet account balance is too low for the transaction base fee. (Mitigate by adding native XLM to the wallet).
*   **Signature verification failed:** Soroban rejects the transaction signature. (Mitigate by ensuring the correct key signed the transaction envelope).
