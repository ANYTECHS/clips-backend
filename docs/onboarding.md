# Developer onboarding guide

This guide is intended for new backend developers working on ClipCash. It covers the local setup flow, required services, environment configuration, Swagger usage, and the standard contribution workflow.

## 1) Prerequisites

Before you start, install the following:

- Node.js 18+
- npm 9+
- Git
- Docker + Docker Compose (recommended for PostgreSQL and Redis)
- Optional: Prisma Studio for database inspection

You should also be comfortable with:
- NestJS projects
- TypeScript
- Prisma schema work
- BullMQ job processing
- environment variables

## 2) Repository setup

Clone the project and move into it:

```bash
git clone https://github.com/ANYTECHS/clips-backend.git
cd clips-backend
```

Install dependencies:

```bash
npm install
```

If you are contributing upstream, add the original repository as an upstream remote:

```bash
git remote add upstream https://github.com/ANYTECHS/clips-backend.git
```

## 3) Environment configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

Then update the values in `.env` for your local environment. At minimum, you will need:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/clipscash?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
JWT_SECRET="your_local_jwt_secret"
ENCRYPTION_SECRET="your_encryption_secret_min_32_chars"
STELLAR_NETWORK="testnet"
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
SOROBAN_NFT_CONTRACT_ID="your_testnet_contract_id"
```

Important notes:
- Never commit your `.env` file.
- Use placeholder values in docs and Swagger examples.
- Keep real secrets in your local environment, CI secrets manager, or secure dev setup.

For the full list of environment variables, see the repository examples in `.env.example` and the Stellar guide in [docs/stellar-configuration.md](./stellar-configuration.md).

## 4) Database setup

This backend uses Prisma with PostgreSQL.

If you are using Docker Compose, start the database:

```bash
docker compose up -d
```

Then initialize Prisma:

```bash
npx prisma migrate dev
```

Useful commands:

```bash
npx prisma generate
npx prisma studio
npx prisma migrate status
```

If you are using a local PostgreSQL instance instead of Docker, create the database and make sure `DATABASE_URL` matches it.

## 5) Redis and BullMQ setup

BullMQ uses Redis for job queues, retries, and rate limiting.

If you are running Redis with Docker Compose, it is started along with Postgres:

```bash
docker compose up -d
```

If you are running Redis locally, ensure it is reachable at:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

Common issues:
- BullMQ jobs stay queued because Redis is not running
- worker concurrency is too high for local hardware
- invalid Redis host/port values in `.env`

## 6) Running the backend

Start the app in development mode:

```bash
npm run start:dev
```

This starts the NestJS app with file watching enabled.

For production-like startup:

```bash
npm run build
npm run start:prod
```

Default local API URL:

```text
http://localhost:3000
```

## 7) Swagger setup and local API docs

This project exposes Swagger/OpenAPI for local development.

When running in development mode, open:

```text
http://localhost:3000/api/docs
```

The following docs are available locally:

- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

To export the schema manually:

```bash
npm run openapi:export
```

## 8) Authentication inside Swagger

Most protected endpoints require a JWT bearer token.

To authorize requests in Swagger UI:

1. Open the Swagger page.
2. Click the Authorize button.
3. Enter a token in the form `Bearer <token>`.
4. Submit the form.
5. Continue using the API from the Swagger panel.

To get a token, first register or log in through the auth endpoints, then copy the returned access token into Swagger.

Example:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

A typical authenticated flow:

1. Sign up or log in via the auth routes.
2. Copy the returned access token.
3. Use the Swagger Authorize dialog.
4. Call a protected endpoint like wallet, clip, or payout routes.

## 9) Running tests

Run the unit test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run end-to-end tests:

```bash
npm run test:e2e
```

If you are working on Prisma or queue-related changes, do not rely only on unit tests; run the relevant e2e coverage when possible.

## 10) Stellar testnet setup

The app supports Stellar testnet and public/mainnet switching through the environment variable `STELLAR_NETWORK`.

For a local development setup, use:

```env
STELLAR_NETWORK="testnet"
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
```

If you need an account to test Stellar flows:
- use a funded testnet wallet
- configure `STELLAR_WALLET_ADDRESS` or `PLATFORM_WALLET_ADDRESS` with a public testnet address
- avoid committing any real secret keys or private seed material

For NFT and Soroban flows, make sure you have a valid testnet contract ID in `SOROBAN_NFT_CONTRACT_ID`.

## 11) Local development workflow

A typical daily workflow looks like this:

```bash
# 1. install deps
npm install

# 2. start supporting services
docker compose up -d

# 3. copy env values and adjust .env
cp .env.example .env

# 4. sync the database schema
npx prisma migrate dev

# 5. run the backend
npm run start:dev
```

Then verify:

- the API is reachable at `http://localhost:3000`
- Swagger loads at `http://localhost:3000/api/docs`
- Redis is running for BullMQ jobs
- Postgres is accepting connections
- auth flows return valid JWTs

## 12) Contribution workflow

When making a change:

1. Create a branch from main.
2. Make the smallest safe change needed.
3. Update documentation if the runtime behavior or API contract changes.
4. Run the relevant tests locally.
5. Review the diff before committing.
6. Submit a pull request with a clear summary.

Example flow:

```bash
git checkout -b feature/my-change
# make changes
npm test
# optional targeted e2e checks
git add .
git commit -m "feat: describe the change"
git push origin feature/my-change
```

## 13) Safe API testing and examples

When testing endpoints in Swagger or docs:

- use mock or placeholder values where the app expects public addresses
- never include private key material in examples
- keep network-specific examples in separate testnet vs production sections
- prefer `G...` placeholders or `your_...` sample values

## 14) Recommended first tasks for a new contributor

Start with easy, low-risk tasks such as:

- updating a controller description
- documenting environment variables
- fixing a small validation issue
- adding a missing Swagger example
- checking a queue or Prisma error message

As you become familiar with the stack, move on to:

- Prisma schema migrations
- BullMQ worker reliability improvements
- awarding or payout logic
- Stellar testnet integration flows

## 15) Quick reference

### Common commands

```bash
npm install
cp .env.example .env
npm run start:dev
npm test
npm run test:e2e
npx prisma migrate dev
npx prisma studio
```

### Common URLs

```text
http://localhost:3000
http://localhost:3000/api/docs
http://localhost:3000/api/docs-json
```

### Useful docs in this repo

- [README.md](../README.md)
- [docs/stellar-configuration.md](./stellar-configuration.md)
- [.env.example](../.env.example)

This is the recommended baseline for a new developer to get the backend running locally without guesswork.
