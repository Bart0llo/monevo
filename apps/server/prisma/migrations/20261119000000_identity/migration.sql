-- Stage 2 identity: users, user_settings, user_identities, sessions, api_tokens
-- (data-model.md#identity-and-settings, authentication.md, api-tokens.md).
-- OIDC-only (ADR-0020): no passwords, no single-use auth tokens, email is informational and not unique.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "WeekStart" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "week_start" "WeekStart" NOT NULL,
    "date_format" TEXT NOT NULL DEFAULT 'LOCALE',
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "user_agent" TEXT,
    "device_label" TEXT,
    "ip_last" INET,
    "csrf_secret" BYTEA NOT NULL,
    "reauthenticated_at" TIMESTAMPTZ(6),
    "id_token_hint" TEXT,
    "idp_refresh_token" BYTEA,
    "idp_checked_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "display_prefix" TEXT NOT NULL,
    "permissions" TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "last_used_ip" INET,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_id_user_id_key" ON "user_identities"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_issuer_subject_key" ON "user_identities"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_user_id_issuer_key" ON "user_identities"("user_id", "issuer");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_user_id_key" ON "sessions"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_user_id_created_at_idx" ON "api_tokens"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_id_user_id_key" ON "api_tokens"("id", "user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_base_currency_fkey" FOREIGN KEY ("base_currency") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints beyond the Prisma DSL (database-architecture.md#3-constraints-beyond-prismas-dsl).
ALTER TABLE "users" ADD CONSTRAINT "users_display_name_check"
    CHECK (char_length("display_name") BETWEEN 1 AND 100);

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_locale_check"
    CHECK ("locale" IN ('en', 'pl'));
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_date_format_check"
    CHECK ("date_format" IN ('LOCALE', 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'));

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check"
    CHECK ("revoked_reason" IN ('LOGOUT', 'USER_REVOKED', 'DEACTIVATED', 'RESTORE', 'EVICTED', 'IDP_REVOKED', 'REPLACED'));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_check"
    CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));

ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 100);
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_permissions_check"
    CHECK ("permissions" IS NOT NULL);
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_revoked_reason_check"
    CHECK ("revoked_reason" IN ('USER_REVOKED', 'DEACTIVATED', 'RESTORE'));
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_revoked_check"
    CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));
