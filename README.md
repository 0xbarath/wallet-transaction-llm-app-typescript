# Wallet Transaction History Service

A NestJS service that registers EVM wallet addresses, syncs on-chain transaction history, and lets users query it through structured filters or natural-language prompts. It fetches transfers via Alchemy's Asset Transfers API, enforces role-based access control (admin vs user), and provides an admin-only transaction enrichment endpoint that classifies DeFi operations (Aave, Uniswap, Lido, etc.) with optional LLM-powered explanations grounded strictly in on-chain evidence.

See [DESIGN.md](DESIGN.md) for architecture details and design decisions.

## Prerequisites

- Node.js 20+
- Yarn 1.x
- Docker (for Postgres and integration tests)
- **Alchemy API key** — required for syncing on-chain transactions. A free key is available at [alchemy.com](https://www.alchemy.com/) after signup.
- **Anthropic API key** — required for LLM-powered natural-language queries and transaction explanations. Set `ANTHROPIC_API_KEY` in your environment. LLM features are disabled automatically when the key is absent.

## Quick Start

### Docker Compose (Postgres)

```bash
cp .env.example .env
# Edit .env with your Alchemy and Anthropic API keys
docker compose up -d
yarn install
npx prisma migrate deploy
npx prisma db seed
yarn start:dev
```

Swagger UI: http://localhost:3000/api-docs

## API Usage

All API endpoints require `X-Auth-WalletAccess: allow` header.

### Register a wallet

```bash
curl -X POST localhost:3000/v1/wallets \
  -H "X-Auth-WalletAccess: allow" \
  -H "Content-Type: application/json" \
  -d '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","network":"eth-mainnet","label":"vitalik"}'
```

### Sync transactions

```bash
curl -X POST localhost:3000/v1/wallets/{walletId}/sync \
  -H "X-Auth-WalletAccess: allow" \
  -H "Content-Type: application/json" \
  -d '{"lookbackDays":30}'
```

### Query transactions (admin)

```bash
curl "localhost:3000/v1/transactions?walletId={id}&limit=10" \
  -H "X-Auth-WalletAccess: allow" \
  -H "X-Role: admin"
```

<details>
<summary>Sample admin response</summary>

```json
{
  "items": [
    {
      "id": "b10e2d37-8f1a-4c9e-a7d2-3e5f6a8b9c0d",
      "walletId": "550e8400-e29b-41d4-a716-446655440000",
      "network": "eth-mainnet",
      "hash": "0x9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
      "blockNum": "19456789",
      "blockTs": "2025-03-15T14:23:01.000Z",
      "fromAddr": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "toAddr": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "direction": "OUT",
      "asset": "USDC",
      "category": "ERC20",
      "valueDecimal": "2500",
      "tokenId": null,
      "createdAt": "2025-03-15T14:23:01.000Z"
    },
    {
      "id": "c20f3e48-9g2b-5d0f-b8e3-4f6g7b9c0d1e",
      "walletId": "550e8400-e29b-41d4-a716-446655440000",
      "network": "eth-mainnet",
      "hash": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      "blockNum": "19456700",
      "blockTs": "2025-03-15T13:45:30.000Z",
      "fromAddr": "0x0000000000000000000000000000000000000000",
      "toAddr": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "direction": "IN",
      "asset": "ETH",
      "category": "INTERNAL",
      "valueDecimal": "0.5",
      "tokenId": null,
      "createdAt": "2025-03-15T13:45:30.000Z"
    }
  ],
  "nextCursor": "eyJ0cyI6IjIwMjUtMDMtMTVUMTM6NDU6MzBaIiwiaWQiOiJjMjBmM2U0OC05ZzJiLTVkMGYtYjhlMy00ZjZnN2I5YzBkMWUifQ==",
  "querySpec": {
    "walletId": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 10,
    "sort": "createdAt_desc"
  }
}
```

Note: admin responses include `INTERNAL` category transfers.

</details>

### Query transactions (user) — no internal transfers

```bash
curl "localhost:3000/v1/transactions?walletId={id}&limit=10" \
  -H "X-Auth-WalletAccess: allow"
```

### Natural language query

```bash
curl -X POST localhost:3000/v1/transactions/query \
  -H "X-Auth-WalletAccess: allow" \
  -H "Content-Type: application/json" \
  -d '{"walletId":"...","prompt":"show outgoing USDC above 100 last 7 days"}'
```

## Architecture

- **API Layer**: WalletController, TransactionController, EnrichmentController with OpenAPI annotations
- **Security**: RequestIdMiddleware -> AuthGuard -> RbacGuard chain (AdminEnrichmentGuard on `/explain` only)
- **Application**: WalletService, SyncService, TransactionQueryService, PromptParserService
- **Domain**: Prisma models (Wallet, Transfer, WalletSyncState), QuerySpec, cursor pagination
- **Infrastructure**: AlchemyService (Alchemy SDK), Prisma migrations, @nestjs/schedule cron

## RBAC

Role is set via the `X-Role` header (defaults to `user` when omitted). Invalid roles return `400 Bad Request`.

| Feature | Admin | User |
|---------|-------|------|
| Internal transfers | Visible | Hidden (filtered out) |
| Explain transaction | Allowed | `403 Forbidden` |

The guard chain enforces this in order:
1. **AuthGuard** — validates `X-Auth-WalletAccess: allow`
2. **RbacGuard** — extracts and validates `X-Role`
3. **AdminEnrichmentGuard** — blocks non-admin access to `/v1/transactions/explain`

## Prompt Parser

The LLM-based prompt parser supports:
- Direction: incoming/outgoing/sent/received/deposits/withdrawals
- Time: today, yesterday, last N days, last week, last month
- Amount: above/below/greater than/less than + value
- Assets: ETH, USDC, USDT, DAI, WETH, WBTC, etc.
- Categories: erc20, erc721, nft, internal, external
- Counterparty: to/from + 0x address

## Transaction Enrichment (Explain API)

Admin-only endpoint that explains what a transaction does by fetching on-chain evidence and optionally generating an LLM explanation with strict anti-hallucination guardrails.

**Access control**: Guarded by RBAC at two layers — the `AdminEnrichmentGuard` rejects non-admin requests with `403 Forbidden` before reaching the controller, and the controller performs a defence-in-depth check. Calling without `X-Role: admin` returns:

```json
{"type":"https://example.com/problems/forbidden","title":"Forbidden","status":403,"detail":"Admin role required"}
```

### Explain a transaction

```bash
curl -X POST localhost:3000/v1/transactions/explain \
  -H "X-Auth-WalletAccess: allow" \
  -H "X-Role: admin" \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x...","network":"eth-mainnet","explain":true}'
```

### Deterministic-only (no LLM)

```bash
curl -X POST localhost:3000/v1/transactions/explain \
  -H "X-Auth-WalletAccess: allow" \
  -H "X-Role: admin" \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x...","explain":false}'
```

### Request fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `txHash` | Yes | — | 32-byte hex transaction hash (`0x` + 64 hex chars) |
| `network` | No | `eth-mainnet` | Alchemy network identifier |
| `explain` | No | `true` | Set `false` to skip LLM explanation |
| `format` | No | `json` | `json` or `human` for human-readable output |

### Response statuses
- **ENRICHED** — receipt fetched, labels matched, operation classified, LLM explanation validated
- **PARTIAL** — deterministic pipeline succeeded but LLM explanation failed validation
- **FAILED** — transaction receipt not found on-chain

<details>
<summary>Sample ENRICHED response</summary>

```json
{
  "txHash": "0x38f4c01391970fee4e0dba28de1c31e4876d6e4a03e10a0e3959a5b2d0c42c36",
  "network": "eth-mainnet",
  "status": "ENRICHED",
  "protocolHints": [
    {
      "address": "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
      "protocol": "aave",
      "label": "Aave V3 Pool",
      "confidence": 0.95,
      "source": "known_protocols",
      "category": "lending"
    }
  ],
  "operation": {
    "name": "aave_supply",
    "confidence": 0.9,
    "evidenceIds": ["ev:log:0", "ev:log:1"]
  },
  "explanation": {
    "summary": "User supplied 1000 USDC to the Aave V3 lending pool.",
    "steps": [
      {
        "text": "1000 USDC transferred from sender to Aave V3 Pool [ev:log:0]",
        "evidenceIds": ["ev:log:0"]
      },
      {
        "text": "Aave V3 Pool emitted Supply event crediting the sender [ev:log:1]",
        "evidenceIds": ["ev:log:1"]
      }
    ],
    "unknowns": [],
    "safetyNotes": ["Always verify contract addresses on a block explorer before trusting labels."]
  },
  "evidence": [
    {
      "id": "ev:tx",
      "type": "transaction",
      "fields": {
        "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "to": "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
        "status": "0x1",
        "blockNumber": "0x128c5e1",
        "gasUsed": "0x3d090"
      }
    },
    {
      "id": "ev:log:0",
      "type": "log",
      "fields": {
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "topics": "[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\"]",
        "data": "0x000000000000000000000000000000000000000000000000000000003b9aca00"
      }
    },
    {
      "id": "ev:log:1",
      "type": "log",
      "fields": {
        "address": "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
        "topics": "[\"0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61\"]",
        "data": "0x..."
      }
    }
  ],
  "localTransfers": [
    {
      "walletId": "550e8400-e29b-41d4-a716-446655440000",
      "direction": "OUT",
      "asset": "USDC",
      "value": "1000",
      "category": "ERC20",
      "blockNum": "19448289"
    }
  ],
  "humanReadable": null
}
```

</details>

### Guardrails
- Evidence-only grounding: LLM receives a pre-built evidence bundle, never accesses the chain
- Mandatory citation: every claim must reference specific evidence IDs
- Post-validation: phantom addresses, non-existent evidence IDs, and invalid JSON are rejected
- Kill switch: set `explain=false` or omit `ANTHROPIC_API_KEY` to disable LLM

### Supported protocol interactions
- **Aave V3**: Supply, Withdraw, Borrow, Repay, Liquidation, FlashLoan
- **Uniswap V2/V3**: Swap
- **Lido**: stETH staking
- **Compound V3**: cUSDCv3 lending
- **WETH**: Wrap/unwrap

## Testing

```bash
# Unit tests
yarn test

# Integration tests (requires Docker)
yarn test:e2e
```
