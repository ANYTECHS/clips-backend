-- #170: Add stellarPublicKey and walletType to User model
-- #169: Add encryptedStellarSecret for server-side AES-256-GCM encrypted secret key storage
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "stellarPublicKey"       TEXT,
  ADD COLUMN IF NOT EXISTS "walletType"             TEXT,
  ADD COLUMN IF NOT EXISTS "encryptedStellarSecret" TEXT;
