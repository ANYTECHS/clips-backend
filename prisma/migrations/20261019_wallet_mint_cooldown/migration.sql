ALTER TABLE "Clip" ADD COLUMN "mintWalletAddress" TEXT;

CREATE TABLE "NftWalletMintCooldown" (
    "walletAddress" TEXT NOT NULL,
    "lastMintAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NftWalletMintCooldown_pkey" PRIMARY KEY ("walletAddress")
);