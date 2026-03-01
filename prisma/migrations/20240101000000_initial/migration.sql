-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TransferCategory" AS ENUM ('EXTERNAL', 'INTERNAL', 'ERC20', 'ERC721', 'ERC1155');

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "address" VARCHAR(42) NOT NULL,
    "network" VARCHAR(32) NOT NULL,
    "label" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "network" VARCHAR(32) NOT NULL,
    "unique_id" VARCHAR(256) NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "block_num" BIGINT NOT NULL,
    "block_ts" TIMESTAMPTZ,
    "from_addr" VARCHAR(42) NOT NULL,
    "to_addr" VARCHAR(42),
    "direction" "Direction" NOT NULL,
    "asset" VARCHAR(64),
    "category" "TransferCategory" NOT NULL,
    "value_decimal" DECIMAL(38,18),
    "raw_value" VARCHAR(256),
    "raw_contract_addr" VARCHAR(42),
    "raw_contract_decimals" INTEGER,
    "token_id" VARCHAR(256),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_sync_state" (
    "wallet_id" UUID NOT NULL,
    "last_synced_block" BIGINT,
    "last_synced_at" TIMESTAMPTZ,
    "sync_in_progress" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_sync_state_pkey" PRIMARY KEY ("wallet_id")
);

-- CreateTable
CREATE TABLE "address_labels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network" VARCHAR(32) NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "protocol" VARCHAR(64) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "category" VARCHAR(64),
    "source" VARCHAR(64) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_address_network_key" ON "wallets"("address", "network");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_network_unique_id_key" ON "transfers"("network", "unique_id");

-- CreateIndex
CREATE INDEX "transfers_wallet_id_created_at_idx" ON "transfers"("wallet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transfers_wallet_id_asset_created_at_idx" ON "transfers"("wallet_id", "asset", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transfers_wallet_id_category_created_at_idx" ON "transfers"("wallet_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transfers_wallet_id_block_num_idx" ON "transfers"("wallet_id", "block_num" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "address_labels_network_address_key" ON "address_labels"("network", "address");

-- CreateIndex
CREATE INDEX "address_labels_network_protocol_idx" ON "address_labels"("network", "protocol");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_sync_state" ADD CONSTRAINT "wallet_sync_state_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
