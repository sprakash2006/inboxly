-- Repairs schema objects missing from legacy databases whose migration history
-- predates this repository's canonical baseline. Every statement is idempotent
-- so a freshly provisioned database remains unaffected.

CREATE TABLE IF NOT EXISTS "WhatsAppAuthOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'AUTHENTICATION',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppAuthOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppAuthOtp_phone_purpose_idx"
    ON "WhatsAppAuthOtp"("phone", "purpose");

-- A legacy non-unique index exists on some deployments. The unique index is
-- required to associate each Meta delivery receipt with only one transaction.
DROP INDEX IF EXISTS "AuthenticationTransaction_metaMessageId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "AuthenticationTransaction_metaMessageId_key"
    ON "AuthenticationTransaction"("metaMessageId");

ALTER TABLE "Workspace"
    ALTER COLUMN "delayedMessage" SET DEFAULT 'Sorry for the wait — we''re still looking into this and will reply as soon as we can.';
