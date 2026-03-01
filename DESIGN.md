# Design Document — Wallet Transaction App (TypeScript)

## Table of Contents

- [1. Overview](#1-overview)
- [2. Architecture](#2-architecture)
- [3. Technical Design Choices](#3-technical-design-choices)
- [4. Authentication, Authorization & Rate Limiting — Placeholder Components](#4-authentication-authorization--rate-limiting--placeholder-components)
- [5. Replacing Alchemy with Self-Hosted Nodes and Indexers](#5-replacing-alchemy-with-self-hosted-nodes-and-indexers)
- [6. Multi-Chain Support](#6-multi-chain-support)
- [7. Protocol Context — Adding and Extending Protocol Knowledge](#7-protocol-context--adding-and-extending-protocol-knowledge)
- [8. Future Improvements / Tech Debt](#8-future-improvements--tech-debt)
- [9. Vector Database & Embeddings](#9-vector-database--embeddings)
- [10. Known Issues](#10-known-issues)

---

## 1. Overview

The Wallet Transaction App is a NestJS service that lets users register Ethereum wallets, sync on-chain transfer history, query transactions with structured filters or natural language, and get LLM-powered explanations of individual transactions.

### Core Capabilities

| Capability | Description |
|---|---|
| **Wallet registration** | Register a wallet address + network, assign labels |
| **Transaction sync** | Pull transfer history from Alchemy (`alchemy_getAssetTransfers`), deduplicate, and persist |
| **Structured query** | Filter by direction, category, asset, value range, counterparty, time range with cursor-based pagination |
| **Natural-language query** | LLM parses a free-text prompt into a `QuerySpec` and executes the same query pipeline |
| **Transaction explanation** | Collects on-chain evidence (receipt, logs, local transfers), labels known protocol addresses, classifies the operation by event signature, and optionally asks an LLM to produce a step-by-step explanation citing that evidence |

### Request Flow

```
Client
  │
  ├─ POST /v1/wallets                   → WalletService
  ├─ POST /v1/wallets/{id}/sync         → SyncService → AlchemyService
  ├─ GET  /v1/transactions              → TransactionQueryService
  ├─ POST /v1/transactions:query        → PromptParserService (LLM) → TransactionQueryService
  └─ POST /v1/transactions/explain      → TransactionExplainService
                                              ├─ EvidenceCollectorService  (Alchemy SDK)
                                              ├─ ProtocolLabelerService    (address_labels DB)
                                              ├─ OperationClassifierService (event-signatures.json)
                                              └─ LlmExplainerService       (Anthropic API)
```

All requests pass through a middleware/guard chain: `RequestIdMiddleware` → `AuthGuard` (global) → `RbacGuard` (global) → `AdminEnrichmentGuard` (`/explain` only).

---

## 2. Architecture

### Layers

```
┌──────────────────────────────────────────────────────────┐
│  Middleware & Guards (Auth, RBAC, RequestId, AdminEnrich) │
├──────────────────────────────────────────────────────────┤
│  Controllers (Wallet, Transaction, Enrichment, Health)   │
├──────────────────────────────────────────────────────────┤
│  Services                                                │
│    WalletService       TransactionQueryService           │
│    SyncService         TransactionExplainService         │
│    PromptParserService EvidenceCollectorService           │
│    LlmExplainerService OperationClassifierService        │
│    ProtocolLabelerService  RateLimiterService             │
├──────────────────────────────────────────────────────────┤
│  Data Access (Prisma Client)                             │
│    Wallet  Transfer  WalletSyncState  AddressLabel       │
├──────────────────────────────────────────────────────────┤
│  External Integrations                                   │
│    AlchemyService / Alchemy SDK (blockchain data)        │
│    @anthropic-ai/sdk (LLM)                               │
├──────────────────────────────────────────────────────────┤
│  Database (PostgreSQL)  managed by Prisma Migrate         │
└──────────────────────────────────────────────────────────┘
```

### Key Tables

| Table | Purpose |
|---|---|
| `wallets` | Registered wallet addresses with network and label |
| `transfers` | Synced on-chain transfers, deduplicated by `(network, unique_id)` |
| `wallet_sync_state` | Tracks last synced block and sync lock per wallet |
| `address_labels` | Curated mapping of contract addresses to protocol names (e.g., Uniswap V3 Router) |

### Explanation Pipeline

The transaction explain flow is the most involved path in the application. It assembles an **evidence bundle** before asking the LLM anything:

1. **EvidenceCollectorService** — calls `eth_getTransactionReceipt` via Alchemy SDK, parses the receipt and logs into typed evidence items (`ev:tx`, `ev:log:N`), and attaches any local transfers already in the DB (`ev:transfer:N`). Caps at 50 logs and 1024 characters per log data field.
2. **ProtocolLabelerService** — extracts every address from the receipt (from, to, log emitters), looks them up in the `address_labels` table, and produces `ProtocolHint` objects and `ev:label:*` evidence items.
3. **OperationClassifierService** — walks the receipt logs, matches each `topic[0]` against `event-signatures.json`, and returns an `OperationResult` (e.g., `uniswap_swap` at confidence 0.9).
4. **LlmExplainerService** — sends the full evidence bundle + protocol hints + classified operation to the Anthropic API with a system prompt that instructs the model to cite evidence IDs, avoid fabricating addresses, and list unknowns. The response is validated: all cited evidence IDs must exist, and every hex string matching `0x[a-fA-F0-9]{40,64}` in the response text is checked against known addresses from evidence items and protocol hints (with ABI-encoded address extraction to catch packed 32-byte words). If the LLM introduces any address not found in the evidence, the response is rejected and `null` is returned.

This evidence-first design means the LLM is constrained to what is provably on-chain rather than hallucinating transaction details.

---

## 3. Technical Design Choices

### 3.1 DTOs and Validation

All request DTOs use `class-validator` decorators for input validation and `class-transformer` for type coercion. NestJS's global `ValidationPipe` is configured with:

- **`whitelist: true`** — strips properties not defined in the DTO
- **`forbidNonWhitelisted: true`** — rejects requests containing unknown properties
- **`transform: true`** — converts plain objects to DTO class instances
- **`enableImplicitConversion: true`** — automatically converts query parameter strings to numbers/booleans

Response DTOs are plain TypeScript interfaces (`TransferResponse`, `WalletResponse`, `SyncResponse`, `ExplainResult`). The `QuerySpec` interface uses a `normalizeQuerySpec()` function that applies defaults (`limit: 50`, `sort: 'createdAt_desc'`) and clamps the limit to `[1, 200]`.

**Why class-validator over Zod/Joi for DTOs?**

- NestJS's validation pipe has first-class integration with `class-validator` — decorators on DTO classes are validated automatically without manual schema wiring
- OpenAPI/Swagger metadata is derived from class properties + decorators, keeping API docs in sync with validation
- Joi is still used for environment variable validation at startup (via `@nestjs/config`), where declarative schema validation of flat key-value pairs is a better fit

### 3.2 Prisma ORM

Prisma replaces JPA/Hibernate from the Java version:

- **Schema as code** — `prisma/schema.prisma` defines models, relations, indexes, and enums in a declarative DSL
- **Type-safe queries** — the generated Prisma Client provides full TypeScript type safety on all queries, eliminating runtime class-cast errors
- **Migrations** — `prisma migrate deploy` applies SQL migrations in order. Migrations are generated from schema diffs and committed as plain SQL files in `prisma/migrations/`
- **Seeding** — `prisma/seed.ts` populates the `address_labels` table with curated protocol addresses using `upsert` for idempotency

**Mapping conventions**: Prisma model fields use camelCase (`walletId`) mapped to snake_case columns (`wallet_id`) via `@map`. Table names use `@@map("table_name")`.

### 3.3 Cursor-Based Pagination

Transaction queries use keyset (cursor) pagination rather than `OFFSET / LIMIT`:

- The cursor encodes `(createdAt, id)` as a Base64url string via `encodeCursor()` / `decodeCursor()` in `transaction-cursor.ts`
- The query fetches `limit + 1` rows; if an extra row exists, a `nextCursor` is returned
- The query builder constructs a `WHERE (created_at, id) > (cursor.createdAt, cursor.id)` predicate (or `<` for descending sort) using Prisma's `AND` / `OR` clause composition

This avoids the well-known performance degradation of `OFFSET` on large tables and gives stable pagination even when new transfers are inserted between pages.

### 3.4 Optimistic Locking for Sync

Concurrent sync requests for the same wallet are prevented without database-level locks:

1. `sync()` reads the `WalletSyncState`, asserts `syncInProgress == false`, sets it to `true`, and saves with a `version` check. The `WHERE walletId = :id AND version = :current` clause causes a Prisma `RecordNotFound` error if two requests race — the loser gets a `SyncInProgressException` (HTTP 409).
2. The `finally` block sets `syncInProgress = false` and updates `lastSyncedBlock` after the sync completes (or fails).

This is lighter than `SELECT ... FOR UPDATE` and works well at the expected concurrency level (one or few sync requests per wallet).

### 3.5 Deduplication

Each Alchemy transfer has a `uniqueId` (a vendor-assigned identifier). Before batch-inserting, `SyncService` queries `prisma.transfer.findMany()` to get already-stored uniqueIds, filters them out, then calls `createMany({ skipDuplicates: true })`. The `@@unique([network, uniqueId])` constraint provides a database-level safety net.

### 3.6 LLM Safety Validations

The `LlmExplainerService` does not blindly trust the LLM response. After parsing the JSON:

1. **Evidence citation check** — every `evidenceId` referenced in `steps[].evidenceIds` must exist in the evidence bundle.
2. **Phantom address detection** — all hex strings matching `0x[a-fA-F0-9]{40,64}` in the response text are extracted. Each is checked against the set of known addresses from evidence items and protocol hints. ABI-encoded data (32-byte words starting with `0x000000000000000000000000`) is also parsed to extract embedded 20-byte addresses. If the LLM introduces any address not found in the evidence, the response is rejected and `null` is returned.

This prevents the LLM from hallucinating contract addresses or counterparties that have no on-chain basis.

### 3.7 Error Handling

All domain exceptions extend base `Error` and are mapped to HTTP status codes in `GlobalExceptionFilter` using RFC 7807 Problem Detail format:

| Exception | HTTP Status |
|---|---|
| `WalletNotFoundException` | 404 |
| `DuplicateWalletException` | 409 |
| `SyncInProgressException` | 409 |
| `RateLimitExceededException` | 429 |
| `ForbiddenCategoryException` | 403 |
| `InvalidCursorException` | 400 |
| `PromptParseException` | 422 (with `needsClarification` list) |
| `AlchemyApiException` | 502 |

The `PromptParseException` is notable — when the LLM determines that a user prompt is ambiguous, it returns a `needsClarification` list (e.g., "Did you mean USDC or USDT?") which is surfaced to the client in the 422 response body.

### 3.8 Observability

- **Logging interceptor**: `LoggingInterceptor` logs `METHOD URL STATUS_CODE ELAPSED_MS [REQUEST_ID]` for every request
- **Request ID**: `RequestIdMiddleware` generates a UUID per request (or passes through `X-Request-Id`), available to all handlers via the `@RequestId()` decorator
- **Health check**: `/health` endpoint via `@nestjs/terminus` reports application liveness

---

## 4. Authentication, Authorization & Rate Limiting — Placeholder Components

The current auth, RBAC, and rate-limiting implementations are **intentionally minimal placeholders** designed to enable end-to-end development and testing. They must be replaced before any production deployment.

### 4.1 AuthGuard — Static Token Check

`AuthGuard` checks for a header `X-Auth-WalletAccess: allow`. Any request with this exact value passes; anything else gets a 401.

**What to replace it with:**

- **JWT / OAuth 2.0 Bearer tokens** — validate signed tokens from an identity provider (Auth0, Keycloak, AWS Cognito, etc.)
- **Passport.js integration** — use `@nestjs/passport` with a JWT strategy, which integrates natively with NestJS guards and provides standard authentication patterns
- **API key management** — if the API serves machine clients, implement proper API key issuance, rotation, and hashing (never store plaintext keys)
- **mTLS** — for service-to-service communication, mutual TLS eliminates the need for application-level tokens entirely

### 4.2 RbacGuard — Header-Based Role Assignment

`RbacGuard` reads `X-Role: admin|user` from the request header and stores it on the request object. The client self-declares its role — there is no verification.

**What to replace it with:**

- **Token-embedded claims** — extract roles/permissions from JWT claims (`roles`, `scope`, `permissions`) rather than trusting a client-provided header
- **NestJS CASL integration** — use `@casl/ability` with NestJS to define fine-grained authorization policies
- **Wallet ownership verification** — the current system has no concept of "this wallet belongs to this user." A production system should verify that the authenticated user owns the wallet they're querying, either through a `user_wallets` join table or by encoding wallet access in the token

### 4.3 AdminEnrichmentGuard — Static Role Gate

`AdminEnrichmentGuard` gates the `/explain` endpoint to `admin` role only. Since the role is self-declared via header, this provides no real security.

**What to replace it with:**

- Method-level guards derived from authenticated token claims, with the `@Roles()` decorator and a centralized authorization guard
- Consider whether "admin" is the right abstraction — transaction explanation may be better gated by a permission like `enrichment:explain` rather than a blanket admin role

### 4.4 RateLimiterService — In-Memory, Single-Instance

The current rate limiter uses an in-memory `Map<string, TokenBucket>` with configurable tokens-per-second and capacity. A `@Cron('*/10 * * * *')` job evicts stale buckets (TTL 1 hour). It works correctly for a single instance but has significant production limitations:

- **Not distributed** — in a multi-instance deployment, each instance maintains its own bucket state, so the effective rate is multiplied by the number of instances
- **No persistence** — rate limit state is lost on restart
- **Per-wallet only** — no global rate limiting, no per-IP or per-user limits

**What to replace it with:**

- **Redis-backed rate limiting** — use Redis with Lua scripts (e.g., `rate-limiter-flexible` npm package) for distributed, consistent rate limiting across all instances
- **@nestjs/throttler** — the official NestJS throttler module supports Redis storage and integrates with the guard system
- **API Gateway rate limiting** — offload rate limiting to the gateway layer (Kong, AWS API Gateway, Envoy) so the application doesn't need to handle it at all
- **Tiered limits** — different rate limits for different operations (sync is expensive and should be more tightly limited than reads)

### 4.5 RequestIdMiddleware — Adequate, But Consider Standards

`RequestIdMiddleware` generates a UUID if `X-Request-Id` is absent and attaches it to the response. This is functional but could be improved:

- Support the W3C `traceparent` header for distributed tracing
- Integrate with OpenTelemetry for end-to-end trace propagation across service boundaries

---

## 5. Replacing Alchemy with Self-Hosted Nodes and Indexers

### 5.1 Current State

All blockchain data access is routed through Alchemy:

- `EvidenceCollectorService` calls `eth_getTransactionReceipt` via `AlchemyService` (using the Alchemy SDK) — this is a **standard JSON-RPC method**, but it's routed through Alchemy's hosted endpoint
- `SyncService` calls `getAssetTransfers` via `AlchemyService` — this is a **proprietary Alchemy API** with no standard JSON-RPC equivalent. It provides pre-indexed transfer data (ERC-20, ERC-721, ERC-1155, internal, external) with pagination
- `AlchemyService` and the types in `alchemy/types/alchemy-transfer.type.ts` are vendor-specific

This creates vendor lock-in, ongoing API cost, and a single point of failure.

### 5.2 Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application                          │
│                                                         │
│  EvidenceCollector ─────┐    SyncService ──────┐        │
│                         │                      │        │
│            BlockchainDataProvider (interface)   │        │
│              ┌──────────┴──────────┐           │        │
│              │                     │           │        │
│     EthJsonRpcProvider    AlchemyProvider       │        │
│              │                               TransferIndexProvider │
│              │                        ┌────────┴───────┐│
│              │                        │                ││
│              │                 GraphNodeProvider  AlchemyProvider  │
└──────────────┼────────────────────────┼────────────────┘│
               │                        │                  │
    ┌──────────▼──────────┐  ┌──────────▼──────────┐      │
    │  Self-hosted Node   │  │  The Graph Node      │      │
    │  (Geth / Erigon)    │  │  + custom subgraph   │      │
    │                     │  │                      │      │
    │  eth_* JSON-RPC     │  │  GraphQL API         │      │
    └─────────────────────┘  └──────────────────────┘
```

### 5.3 Self-Hosted Ethereum Node (for `eth_*` calls)

**Purpose**: Replace Alchemy for standard JSON-RPC calls like `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call`.

**Recommended clients:**

| Client | Language | Notes |
|---|---|---|
| **Geth** | Go | Most widely used, large community |
| **Erigon** | Go | Lower disk usage (< 2TB vs Geth's ~12TB for archive), faster sync |
| **Nethermind** | C# | Good performance, active development |
| **Reth** | Rust | Newest, designed for high throughput |

**Considerations:**

- Run a **full node** (not archive) for most use cases — `eth_getTransactionReceipt` works on any synced node. Only upgrade to archive if you need `eth_call` at historical blocks
- Place an **RPC load balancer** (e.g., Nginx, HAProxy, or a dedicated tool like `web3-proxy`) in front of multiple nodes for availability
- Keep Alchemy (or another hosted provider) as a **fallback** — route to it when self-hosted nodes are behind or unreachable. The `BlockchainDataProvider` interface makes this a configuration switch
- **Hardware requirements**: Full node needs ~1TB SSD (Erigon) to ~12TB (Geth archive), 16+ GB RAM, fast NVMe storage for sync performance

### 5.4 The Graph Node (for transfer indexing, replacing `alchemy_getAssetTransfers`)

**Purpose**: The `alchemy_getAssetTransfers` API is proprietary. It pre-indexes all token transfers and provides a paginated query API. To self-host the equivalent, deploy a **Graph Node** running a custom subgraph.

**What is a subgraph?**

A subgraph is a declarative definition of which on-chain events to index and how to store them. It consists of:

1. **`subgraph.yaml`** — declares the smart contracts and events to listen for (e.g., ERC-20 `Transfer(address,address,uint256)`, ERC-721 `Transfer(address,address,uint256)`, WETH `Deposit`/`Withdrawal`)
2. **`schema.graphql`** — defines the indexed entity schema (mirrors our `transfers` table)
3. **AssemblyScript mappings** — event handler functions that parse event data and write to the Graph Node's PostgreSQL store

**Query interface**: Once indexed, the subgraph exposes a GraphQL API. The `SyncService` would query transfers by wallet address, block range, and category — the same filters that `alchemy_getAssetTransfers` supports.

**Example subgraph entity:**

```graphql
type Transfer @entity {
  id: ID!
  hash: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  from: Bytes!
  to: Bytes!
  value: BigDecimal!
  asset: String!
  category: TransferCategory!
  contractAddress: Bytes
  tokenId: BigInt
}
```

**Deployment:**

- Run a Graph Node instance backed by PostgreSQL and connected to your self-hosted Ethereum node (via JSON-RPC websocket for real-time block streaming)
- Deploy your custom subgraph to this Graph Node
- The subgraph processes every block, extracting `Transfer` events and internal call traces (for internal ETH transfers)
- Internal transfers require trace API access (`debug_traceBlockByNumber` or `trace_block`), which means the Ethereum node must be run with tracing enabled (Erigon supports this natively; Geth needs `--gcmode=archive`)

**Alternatives to The Graph:**

- **Ponder** — a newer TypeScript-based indexer, simpler to set up but less battle-tested
- **Subsquid** — offers a hosted "Subsquid Network" plus self-hosted "Squid" processors
- **Custom indexer** — a dedicated service that listens to new blocks, decodes events, and writes to the application's own `transfers` table directly. More operational overhead but zero external dependency
- **Goldsky** — hosted subgraph infrastructure (if you want Graph-compatible indexing without running Graph Node yourself)

### 5.5 Implementation Path

1. **Extract interfaces** — `BlockchainRpcProvider` (for `eth_*` calls) and `TransferIndexProvider` (for transfer queries) as TypeScript interfaces
2. **Implement Alchemy adapters** behind these interfaces (preserve current behavior)
3. **Implement self-hosted adapters** — `EthJsonRpcProvider` calls your node directly; `GraphSubgraphProvider` queries the subgraph's GraphQL API
4. **Config-driven switching** — `app.blockchain.provider: alchemy | self-hosted | hybrid` where hybrid uses self-hosted as primary with Alchemy fallback
5. **Health checks** — monitor node sync status (`eth_syncing`), subgraph indexing head vs chain head, and fail over to Alchemy when the gap exceeds a threshold

---

## 6. Multi-Chain Support

### 6.1 Current State

The application uses a `network` field on wallets, transfers, and address labels (defaulting to `eth-mainnet`). This field flows through all queries and API calls, but the infrastructure only targets Ethereum mainnet:

- `app.config.ts` has a single `alchemy.rpcUrl` / `alchemy.apiKey` — no per-chain configuration
- `event-signatures.json` only contains Ethereum event topics (Aave V3, Uniswap V2/V3)
- The seeded `address_labels` in `prisma/seed.ts` are all for `eth-mainnet`
- Block number calculations in `SyncService` assume Ethereum's ~12-second block time (`BLOCKS_PER_DAY = 7200`)

### 6.2 What Multi-Chain Requires

#### Per-Chain RPC Configuration

Replace the single Alchemy endpoint with a registry of chain configurations in `app.config.ts`:

```typescript
chains: {
  'eth-mainnet': {
    rpcUrl: process.env.ETH_MAINNET_RPC_URL,
    chainId: 1,
    blockTimeSeconds: 12,
    explorerUrl: 'https://etherscan.io',
  },
  'polygon-mainnet': {
    rpcUrl: process.env.POLYGON_MAINNET_RPC_URL,
    chainId: 137,
    blockTimeSeconds: 2,
    explorerUrl: 'https://polygonscan.com',
  },
  'arbitrum-mainnet': {
    rpcUrl: process.env.ARBITRUM_MAINNET_RPC_URL,
    chainId: 42161,
    blockTimeSeconds: 0.25,
    explorerUrl: 'https://arbiscan.io',
  },
  'base-mainnet': {
    rpcUrl: process.env.BASE_MAINNET_RPC_URL,
    chainId: 8453,
    blockTimeSeconds: 2,
    explorerUrl: 'https://basescan.org',
  },
}
```

The `SyncService` block calculation (`lookbackDays * BLOCKS_PER_DAY`) must use per-chain `blockTimeSeconds` rather than hardcoding Ethereum's rate.

#### Per-Chain Event Signatures

Most EVM chains share the same event topic hashes (since they use the same Solidity ABI encoding), but the **protocol deployments differ**:

- Uniswap V3 is deployed on Ethereum, Polygon, Arbitrum, Base, and others — but the router addresses are different on each chain
- Aave V3 has separate deployments per chain with different pool addresses
- Some chains have unique protocols (e.g., Aerodrome on Base, Velodrome on Optimism)

The `event-signatures.json` can remain chain-agnostic (topic hashes are universal), but the `address_labels` table must be seeded per chain.

#### Per-Chain Address Labels

The `address_labels` table already has a `network` column and a unique constraint on `@@unique([network, address])`. Multi-chain support requires populating it for each target chain:

```sql
-- Uniswap V3 on Polygon
INSERT INTO address_labels (network, address, protocol, label, category, source, confidence)
VALUES ('polygon-mainnet', '0xe592427a0aece92de3edee1f18e0157c05861564', 'uniswap-v3',
        'Uniswap V3: SwapRouter', 'dex', 'curated', 0.99);

-- Aave V3 on Arbitrum
INSERT INTO address_labels (network, address, protocol, label, category, source, confidence)
VALUES ('arbitrum-mainnet', '0x794a61358d6845594f94dc1db02a252b5b4814ad', 'aave-v3',
        'Aave V3: Pool', 'lending', 'curated', 0.99);
```

#### Chain-Specific Transfer Categories

EVM chains generally support the same transfer categories (EXTERNAL, INTERNAL, ERC20, ERC721, ERC1155), but some chains have nuances:

- **L2 rollups** (Arbitrum, Optimism, Base) have L1→L2 and L2→L1 bridge transfers that don't map cleanly to EXTERNAL/INTERNAL
- **Polygon** has a separate bridge contract for MATIC ↔ Ethereum transfers
- Consider adding categories like `BRIDGE_DEPOSIT` and `BRIDGE_WITHDRAWAL`, or a separate `bridgeInfo` field on transfers

#### Wallet Address Format Validation

The current validation (`^0x[a-fA-F0-9]{40}$`) is correct for all EVM chains. If non-EVM chains (Solana, Bitcoin, Cosmos) are ever added, the address validation must become chain-aware.

### 6.3 Implementation Path

1. **Chain registry** — introduce a `ChainConfig` interface and a `ChainRegistryService` that resolves configuration by network name
2. **Per-chain RPC routing** — `AlchemyService` (or the new `BlockchainRpcProvider`) selects the correct endpoint based on the `network` field
3. **Seed address labels** — add Prisma seed entries or a migration to populate `address_labels` for each supported chain
4. **Dynamic block time** — replace the hardcoded `BLOCKS_PER_DAY` constant in `SyncService` with `chainConfig.blockTimeSeconds`-based calculation
5. **Chain validation** — validate the `network` field in `RegisterWalletDto` against the set of supported chains (reject unknown networks early)

---

## 7. Protocol Context — Adding and Extending Protocol Knowledge

The explanation pipeline's quality depends directly on how much the system knows about the protocols involved in a transaction. Protocol context flows through two mechanisms: **address labels** and **event signatures**.

### 7.1 Address Labels (`address_labels` table)

Each row maps a contract address on a specific network to a protocol, human-readable label, category, and confidence score:

```
network=eth-mainnet  address=0x68b3...fc45  protocol=uniswap-v3
label="Uniswap V3: Router 2"  category=dex  confidence=0.99  source=curated
```

When the `ProtocolLabelerService` finds a match, it produces:
- A `ProtocolHint` (shown to the LLM: "this address is Uniswap V3's Router")
- An `EvidenceItem` (`ev:label:to`) that the LLM can cite in its explanation

**Currently seeded protocols** (eth-mainnet only):

| Protocol | Addresses | Category |
|---|---|---|
| Aave V3 | Pool | lending |
| Aave V2 | Lending Pool | lending |
| Uniswap V3 | Router, Router 2 | dex |
| Uniswap V2 | Router | dex |
| Lido | stETH | staking |
| Compound V3 | cUSDCv3 | lending |
| WETH | WETH token | token |

### 7.2 Event Signatures (`event-signatures.json`)

Maps `topic[0]` hash → operation name. Currently covers:

| Protocol | Events |
|---|---|
| Aave V3 | Supply, Withdraw, Borrow, Repay, LiquidationCall, FlashLoan |
| Uniswap V2 | Swap |
| Uniswap V3 | Swap |

### 7.3 How to Add a New Protocol

Adding context for a new protocol (e.g., Curve, MakerDAO, 1inch) involves three steps:

**Step 1 — Seed address labels**

Add entries to `prisma/seed.ts` or create a Prisma migration:

```typescript
{
  network: 'eth-mainnet',
  address: '0xd51a44d3fae010294c616388b506acda1bfaae46',
  protocol: 'curve',
  label: 'Curve: Tricrypto2 Pool',
  category: 'dex',
  source: 'curated',
  confidence: 0.99,
},
{
  network: 'eth-mainnet',
  address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
  protocol: 'curve',
  label: 'Curve: 3pool',
  category: 'dex',
  source: 'curated',
  confidence: 0.99,
},
```

**Step 2 — Add event signatures**

Find the protocol's key event `topic[0]` hashes (from the contract ABI or Etherscan) and add them to `src/enrichment/data/event-signatures.json`:

```json
{
  "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140": {
    "name": "TokenExchange",
    "protocol": "curve",
    "operation": "curve_swap"
  },
  "0xd013ca23e77a65003c2c659c5442c00c805371b7fc1ebd4c206c41d1536bd90b": {
    "name": "AddLiquidity",
    "protocol": "curve",
    "operation": "curve_add_liquidity"
  }
}
```

**Step 3 — (Optional) Add protocol-specific ABI decoding**

For richer explanations, the `EvidenceCollectorService` could decode log data using the protocol's ABI rather than passing raw hex to the LLM. This is not yet implemented but the evidence item `fields` map is flexible enough to hold decoded parameters:

```json
{
  "id": "ev:log:0",
  "type": "log",
  "fields": {
    "address": "0xd51a...",
    "event": "TokenExchange",
    "buyer": "0xabc...",
    "sold_id": "0",
    "tokens_sold": "1000000000000000000",
    "bought_id": "2",
    "tokens_bought": "3200000000"
  }
}
```

### 7.4 Scaling Protocol Knowledge

The current curated approach works for a handful of protocols but won't scale to the hundreds of DeFi protocols and thousands of contracts in production. Strategies for scaling:

**Automated label ingestion:**

- **Etherscan verified contracts** — Etherscan's API provides contract names and verified source code. A background job could query the API for addresses seen in transactions and auto-populate `address_labels` with lower confidence (e.g., 0.70)
- **Protocol registries** — projects like DeFi Llama, TokenLists, and the Ethereum Lists GitHub repos maintain curated address mappings that can be periodically imported
- **4byte.directory / Openchain** — these public databases map function selectors and event signatures to human-readable names, which could supplement `event-signatures.json`

**Dynamic ABI resolution:**

- Fetch the ABI from Etherscan's verified contracts API when a log address is encountered for the first time
- Cache the ABI locally and use it to decode log data into named parameters
- This turns opaque `data: 0x000000...` fields into readable `{"amount": "1.5 ETH", "recipient": "0x..."}` evidence

**Confidence-based LLM prompting:**

- The `ProtocolHint.confidence` field already exists. When confidence is low (e.g., auto-imported at 0.70), the LLM system prompt should indicate uncertainty: "This address may be associated with Curve (confidence: 0.70)"
- When confidence is high (curated at 0.99), the prompt can state it as fact: "This address is Uniswap V3: Router 2"

**Community contributions:**

- Expose an API or admin interface for submitting new address labels, subject to review and confidence scoring
- Protocol teams themselves could submit their contract addresses

---

## 8. Future Improvements / Tech Debt

### 8.1 Generify LLM Service — Multi-Provider Support

#### Current State

The LLM integration is tightly coupled to Anthropic with no abstraction layer:

- `LlmExplainerService` directly imports `@anthropic-ai/sdk` and constructs an `Anthropic` client
- `PromptParserService` has the same direct Anthropic dependency
- `app.config.ts` is Anthropic-specific — `anthropic.apiKey`, model defaults to `claude-sonnet-4-20250514`
- No `LlmClient` interface exists — every service directly constructs and calls the Anthropic SDK

#### Target State

- Extract an `LlmClient` interface with a `chat(systemPrompt, userMessage, model, maxTokens)` method
- Anthropic, OpenAI, and Google become implementations behind this interface registered as NestJS providers
- Config supports multiple providers with an `active-provider` selector
- Each provider has its own properties block (API key, base URL, model, timeout)

---

### 8.2 Replace Alchemy with Self-Hosted Infrastructure

See [Section 5](#5-replacing-alchemy-with-self-hosted-nodes-and-indexers) for the full discussion.

#### Current State

All blockchain data access is routed through Alchemy:

- `EvidenceCollectorService` uses `AlchemyService` for `eth_getTransactionReceipt` — a standard JSON-RPC call, but routed through Alchemy's hosted endpoint
- `SyncService` uses `AlchemyService` for `getAssetTransfers` — a **proprietary** Alchemy API with no standard JSON-RPC equivalent
- `AlchemyService` and all types in `alchemy/types/alchemy-transfer.type.ts` are vendor-specific

#### Target State

- Run a self-hosted Ethereum execution client (e.g., Geth, Erigon) for standard JSON-RPC calls (`eth_getTransactionReceipt`)
- Run a Graph node indexing on-chain events to replace `alchemy_getAssetTransfers` with subgraph queries for transfer data
- Extract a `BlockchainDataProvider` interface; Alchemy and self-hosted become interchangeable implementations

---

### 8.3 Additional Tech Debt

- **No wallet ownership model** — any authenticated request can access any wallet. Need a `user_wallets` table and ownership checks
- **Sync is synchronous** — large lookback periods can time out. Consider async sync with status polling or WebSocket notifications
- **No caching** — transaction receipts and address labels are fetched on every explain request. Add a cache layer (in-memory with `@nestjs/cache-manager` or Redis for distributed)
- **Single-region deployment** — no consideration for multi-region availability or data residency
- **No retry on LLM failures** — if the Anthropic call fails or validation rejects the response, the explain endpoint returns `PARTIAL` status with no retry. Consider a configurable retry budget

---

## 9. Vector Database & Embeddings

### 9.1 Why This App Is Different From Typical RAG

Most LLM-powered applications use Retrieval-Augmented Generation (RAG) to search a large document corpus and inject retrieved chunks into the prompt. This app does not have that problem:

- **Evidence is assembled programmatically, not retrieved.** `EvidenceCollectorService` calls `eth_getTransactionReceipt`, parses the receipt and logs, and attaches local transfers from the DB. The evidence bundle is deterministic for a given transaction hash — there is no corpus to search.
- **Address labels are exact-match lookups.** `ProtocolLabelerService` queries the `address_labels` table by `(network, address)`. This is a primary-key lookup, not a semantic search.
- **Event classification is a hash lookup.** `OperationClassifierService` matches `topic[0]` against `event-signatures.json` — a dictionary lookup, not a similarity search.

The right question is not "should we add RAG?" but rather: **"do any components have a retrieval problem that exact-match lookups can't solve?"** The answer is yes — in three specific areas.

### 9.2 Where Embeddings Genuinely Help

#### Phase 1: Few-Shot Explanation Examples (start here)

**Problem:** `LlmExplainerService` sends a system prompt with instructions on how to explain transactions, but includes zero examples of good explanations. The LLM must infer the desired output format and level of detail from instructions alone.

**Solution:** Curate 50–200 example input/output pairs covering diverse operation types (swap, supply, borrow, bridge, approve, transfer) and protocols (Uniswap, Aave, Lido, Compound). Embed each example's input (operation type + protocol hints + evidence shape). At explain time, embed the current evidence bundle's key features and retrieve the most similar example.

**Integration:**

```
LlmExplainerService.explain()
  ├─ embed(operationType + protocolHints + evidenceShape)
  ├─ query embedding_store WHERE category = 'explanation_example'
  │   ORDER BY cosine_similarity DESC LIMIT 1
  ├─ inject retrieved example as "exampleExplanation" in user message
  └─ call Anthropic API with evidence + example
```

**Why this helps:** The LLM sees a concrete example of the expected output for a similar transaction, reducing format drift and improving consistency. This is the lowest-effort, highest-impact use case.

#### Phase 2: Protocol Documentation Retrieval

**Problem:** When `ProtocolLabelerService` identifies an address as "Uniswap V3: Router 2", the LLM receives only this label. It has no context about how Uniswap V3 concentrated liquidity works, what the Router's role is, or how a swap flows through the protocol's contracts.

**Solution:** Embed chunked protocol documentation (500–2000 chunks across major DeFi protocols). At explain time, retrieve the top-2 most relevant chunks based on the classified operation and protocol hints.

**Integration:**

```
LlmExplainerService.explain()
  ├─ embed(operationType + protocolName)
  ├─ query embedding_store WHERE category = 'protocol_doc'
  │   ORDER BY cosine_similarity DESC LIMIT 2
  ├─ inject retrieved chunks as "protocolContext" in user message
  └─ call Anthropic API with evidence + protocolContext + example
```

**Why this helps:** The LLM can explain *why* a transaction happened (e.g., "this is a concentrated liquidity position being minted in a specific price range") rather than just *what* happened at the log level.

#### Phase 3: Semantic Event Signature Fallback

**Problem:** `OperationClassifierService` uses `event-signatures.json` which contains only 8 entries (Aave V3, Uniswap V2/V3). Any transaction involving other protocols returns `operation: "unknown"` with `confidence: 0.0`. Scaling the JSON file manually is slow.

**Solution:** Bulk-load ~20K event signatures from [4byte.directory](https://www.4byte.directory/) (which maps selector hashes to human-readable names). Embed the human-readable event names. When the exact `topic[0]` lookup in `event-signatures.json` misses:

1. Resolve the `topic[0]` hash to its human-readable name via a 4byte.directory lookup table
2. Embed the resolved name (e.g., `"TokenExchange(address,uint256,address,uint256)"`)
3. Similarity-search against known operation categories
4. Return the match at lower confidence (0.6) compared to exact matches (0.9)

**Integration:**

```
OperationClassifierService.classify()
  ├─ try exact match in event-signatures.json (confidence 0.9)
  ├─ if miss:
  │     ├─ resolve topic[0] via 4byte_signatures table
  │     ├─ embed(resolvedSignatureName)
  │     ├─ query embedding_store WHERE category = 'event_signature'
  │     │   ORDER BY cosine_similarity DESC LIMIT 1
  │     └─ return match at confidence 0.6 (if similarity > threshold)
  └─ fallback: operation "unknown", confidence 0.0
```

**Why this helps:** Coverage jumps from 8 known events to thousands, and the explain pipeline gets a meaningful operation classification for the vast majority of DeFi transactions.

### 9.3 Where Embeddings Would NOT Help

| Component | Current Approach | Why Embeddings Don't Add Value |
|---|---|---|
| **`ProtocolLabelerService`** | Exact match by `(network, address)` | Address lookup is a hex string match — there is no semantic similarity between `0x68b3...fc45` and `0x7a25...0e2b`. Embeddings are meaningless on hex addresses. |
| **`PromptParserService`** | LLM extracts structured filters from natural language | The output schema is small and fixed (`QuerySpec` fields: direction, category, asset, etc.). The LLM system prompt covers the query patterns. There is no large corpus of query templates to search. |
| **`EvidenceCollectorService`** | Calls `eth_getTransactionReceipt` + local DB | Evidence assembly is deterministic — given a transaction hash, the evidence is always the same. There is nothing to retrieve semantically. |
| **Address label ingestion** | Prisma seed + future auto-import (Section 7.4) | Scaling address labels means importing from registries (Etherscan, DeFi Llama) — this is a data pipeline problem, not a retrieval problem. |

### 9.4 Vector DB Choice: pgvector

The application already runs PostgreSQL. The corpus sizes for all three embedding use cases are small:

| Use Case | Estimated Vectors |
|---|---|
| Explanation examples | 50–200 |
| Protocol documentation chunks | 500–2,000 |
| Event signatures | ~20,000 |

At <25K total vectors, **pgvector** with an HNSW index handles this trivially. There is no need for a dedicated vector database (Pinecone, Weaviate, Qdrant) at this scale.

**Schema:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embedding_store (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category      VARCHAR(50)  NOT NULL,  -- 'explanation_example', 'protocol_doc', 'event_signature'
    content_key   VARCHAR(255) NOT NULL,  -- human-readable key for dedup (e.g., "uniswap_v3_swap_example_1")
    content       TEXT         NOT NULL,  -- the original text that was embedded
    metadata      JSONB,                  -- flexible metadata (protocol, operation, source URL, etc.)
    embedding     vector(384)  NOT NULL,  -- dimension matches chosen embedding model
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (category, content_key)
);

CREATE INDEX idx_embedding_store_category ON embedding_store (category);
CREATE INDEX idx_embedding_store_hnsw ON embedding_store
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

**Query pattern:**

```sql
SELECT content, metadata, 1 - (embedding <=> $1) AS similarity
FROM embedding_store
WHERE category = $2
ORDER BY embedding <=> $1
LIMIT $3;
```

### 9.5 Embedding Model Options

| Model | Dimensions | Hosting | Latency | Notes |
|---|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | API call | ~50ms | Good quality, adds OpenAI as a vendor dependency |
| Cohere `embed-english-v3.0` | 1024 | API call | ~50ms | Strong on retrieval benchmarks |
| **`all-MiniLM-L6-v2` via ONNX** | 384 | **Self-hosted** | ~5ms | Preferred — no vendor dependency, runs in-process |
| `nomic-embed-text-v1.5` via ONNX | 768 | Self-hosted | ~10ms | Better quality than MiniLM, slightly larger |

**Recommendation: `all-MiniLM-L6-v2` via ONNX Runtime.** At <25K vectors with relatively simple similarity tasks (matching operation types and protocol names), the smaller model is more than sufficient. Running in-process eliminates network latency and API costs. For Node.js, the `onnxruntime-node` package provides ONNX inference support.

### 9.6 Integration Points

| Change | File(s) | Description |
|---|---|---|
| Embedding query before LLM call | `llm-explainer.service.ts` | Retrieve similar explanation example and protocol docs, inject into user message |
| Semantic signature fallback | `operation-classifier.service.ts` | Fall back to embedding similarity when exact `topic[0]` match fails |
| Schema migration | `prisma/migrations/` | Add `embedding_store` table and pgvector extension |
| Configuration | `app.config.ts` | Add `embedding.enabled`, `embedding.modelPath`, `embedding.similarityThreshold` |
| Orchestration | `transaction-explain.service.ts` | Coordinate embedding retrieval timing relative to evidence collection |

### 9.7 Trade-offs and Risks

**Added latency.** Each embedding query adds a round-trip to PostgreSQL (~5–15ms with pgvector HNSW on <25K vectors). With in-process ONNX embedding (~5ms), the total overhead is ~10–20ms per explain request — negligible compared to the Anthropic API call (~1–3s).

**Token budget competition.** The evidence bundle can already reach ~50KB for complex transactions with many logs. Adding protocol documentation chunks and explanation examples increases the prompt size. The `LlmExplainerService` must enforce a token budget and prioritize: evidence bundle > protocol context > few-shot example. If the evidence bundle is large, skip the optional context.

**Embedding quality on DeFi terminology.** General-purpose embedding models may not distinguish well between DeFi-specific terms (e.g., "flash loan" vs. "flash swap" vs. "flash mint"). The similarity thresholds should be tuned conservatively, and the Phase 1 explanation examples should be evaluated for retrieval precision before expanding to Phase 2.

**Maintenance burden.** Embeddings must be regenerated when the embedding model changes. Protocol documentation must be kept current as protocols upgrade. Event signatures should be refreshed periodically from 4byte.directory. This is a recurring operational cost — the `embedding_store` table should track `model_version` in metadata to detect stale embeddings.

**Honest assessment: simpler alternatives cover most cases.** Scaling the curated `event-signatures.json` to ~50 entries (covering the top 20 DeFi protocols) and expanding `address_labels` via automated ingestion from Etherscan/DeFi Llama (Section 7.4) would handle the majority of real-world transactions without any embedding infrastructure. Embeddings are most justified for Phase 1 (few-shot examples) where there is no simpler alternative, and for Phase 3 (semantic signatures) only after the curated list proves insufficient at scale.

### 9.8 Decision Summary

| Component | Needs Embeddings? | Phase | Rationale |
|---|---|---|---|
| `LlmExplainerService` — few-shot examples | **Yes** | Phase 1 | No simpler way to select the most relevant example for a given transaction |
| `LlmExplainerService` — protocol docs | **Yes** | Phase 2 | Retrieval from a chunked doc corpus is a textbook embedding use case |
| `OperationClassifierService` — semantic fallback | **Yes** | Phase 3 | Similarity search over 20K signatures when exact match fails |
| `ProtocolLabelerService` — address lookup | **No** | — | Exact hex match, no semantics involved |
| `PromptParserService` — NL parsing | **No** | — | Small fixed schema, LLM system prompt covers patterns |
| `EvidenceCollectorService` — evidence assembly | **No** | — | Deterministic on-chain data, not a retrieval problem |
| `address_labels` ingestion | **No** | — | Data pipeline problem, not a retrieval problem |

---

## 10. Known Issues

### 10.1 — `computeFromBlock` returns relative block offset instead of absolute block number

**Location:** `src/sync/sync.service.ts:139-159`

`computeFromBlock()` calculates `blocksAgo = daysAgo * BLOCKS_PER_DAY` and returns `'0x' + blocksAgo.toString(16)` as the `fromBlock` parameter for Alchemy's `getAssetTransfers`. However, Alchemy expects an **absolute block number**, not a relative offset. Returning `blocksAgo` directly means the query starts from a very early block (e.g., block ~216,000 for a 30-day lookback), which is from 2015 — far earlier than intended.

**Impact:** Every sync request that uses `startTime` or `lookbackDays` fetches transfers from near the beginning of the Ethereum chain rather than from the intended lookback window, pulling far more history than expected and generating excessive API calls.

**Fix:** Call `alchemy.core.getBlockNumber()` to get the current chain head, then compute `currentBlock - blocksAgo` as the absolute `fromBlock`. Cache the current block number for ~60 seconds to avoid per-request overhead.

### 10.2 — Unbounded Alchemy fetch loop

**Location:** `src/sync/sync.service.ts:169-181` — `do/while (pageKey)` with no page cap

The `fetchAllTransfers()` pagination loop continues until Alchemy stops returning a `pageKey`. For high-activity wallets (exchange hot wallets, popular contracts) this can mean hundreds of thousands of transfers, leading to unbounded memory consumption and API call volume. All transfers are accumulated in an in-memory array before the batch insert.

**Impact:** A single sync for a high-activity wallet can exhaust Alchemy rate limits or cause out-of-memory errors in the Node.js process.

**Fix:** Introduce a `maxPages` configuration property (default 100) and break out of the loop when the limit is reached. Also consider streaming inserts (inserting each page immediately) instead of accumulating all transfers in memory before calling `createMany`.

### 10.3 — `PromptParserService` does not gracefully disable when Anthropic API key is absent

**Location:** `src/transaction/prompt-parser.service.ts:20-25`

`PromptParserService` always constructs an `Anthropic` client: `new Anthropic({ apiKey: apiKey || undefined })`. When the API key is empty (the default from config), passing `undefined` causes the SDK to fall back to the `ANTHROPIC_API_KEY` environment variable. If that is also unset, the first call to `parse()` throws an opaque SDK initialization error.

Compare with `LlmExplainerService` which correctly handles this: `this.client = apiKey ? new Anthropic({ apiKey }) : null` and returns `null` when the client is absent.

**Impact:** Calling `POST /v1/transactions:query` without an Anthropic API key produces an unhelpful SDK error instead of a clear "LLM features are disabled" response.

**Fix:** Apply the same guard pattern as `LlmExplainerService` — set `this.client = null` when no API key is configured, and throw a descriptive `PromptParseException` from `parse()` when the client is null.

### 10.4 — Guards bypass `GlobalExceptionFilter` by writing responses directly

**Location:** `src/common/guards/auth.guard.ts:12-18`, `src/common/guards/rbac.guard.ts:15-21`

Both `AuthGuard` and `RbacGuard` manually write JSON error responses to the Express `Response` object (`res.status(401).json(...)`) and return `false`, instead of throwing NestJS exceptions (`UnauthorizedException`, `BadRequestException`). This bypasses the `GlobalExceptionFilter`, the `LoggingInterceptor`, and any other exception-layer middleware.

**Impact:** Auth/RBAC failures are not logged by the interceptor, produce responses that may diverge in format from the `GlobalExceptionFilter`'s Problem Detail output, and cannot be caught by exception filters or pipes.

**Fix:** Replace the direct `res.status().json()` calls with `throw new UnauthorizedException(...)` and `throw new BadRequestException(...)`. The `GlobalExceptionFilter` already handles `HttpException` subtypes and will produce consistent Problem Detail responses.

### 10.5 — `AlchemyService` hardcodes `Network.ETH_MAINNET`

**Location:** `src/alchemy/alchemy.service.ts:17-21`

The Alchemy SDK client is constructed with `network: Network.ETH_MAINNET` in the constructor. The `network` field on wallets, transfers, and address labels is carried through the data layer but never used to select the Alchemy network. If a wallet is registered with a different network, all API calls still go to Ethereum mainnet.

**Impact:** The database schema supports multi-network data, but the infrastructure silently ignores it. Registering a wallet with `network: "polygon-mainnet"` would sync Ethereum mainnet transfers into a Polygon-labeled record.

**Fix:** Accept `network` as a parameter in `getAssetTransfers()` and `getTransactionReceipt()`, and construct per-network Alchemy SDK instances (or use the Alchemy SDK's network-switching capability). See [Section 6](#6-multi-chain-support) for the full multi-chain design.