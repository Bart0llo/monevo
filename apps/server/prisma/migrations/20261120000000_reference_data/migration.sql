-- Stage 3 reference data: exchange_rates, accounts, categories, users.maintenance_state
-- (data-model.md#currencies-and-rates, data-model.md#ledger, multi-currency.md).

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('PROVIDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'CASH', 'SAVINGS', 'CREDIT_CARD', 'E_WALLET', 'OTHER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "maintenance_state" TEXT;

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "from_currency" CHAR(3) NOT NULL,
    "to_currency" CHAR(3) NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" NUMERIC(24,12) NOT NULL,
    "source" "RateSource" NOT NULL,
    "provider_id" TEXT,
    "published_on" DATE,
    "metadata" JSONB,
    "fetched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "custom_kind_label" TEXT,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "opening_balance" NUMERIC(19,4) NOT NULL DEFAULT 0,
    "opening_date" DATE NOT NULL,
    "include_in_net_worth_widget" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "parent_id" UUID,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_from_currency_to_currency_rate_date_idx" ON "exchange_rates"("from_currency", "to_currency", "rate_date" DESC);

-- CreateIndex
CREATE INDEX "exchange_rates_user_id_idx" ON "exchange_rates"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_sort_order_idx" ON "accounts"("user_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "accounts"("id", "user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_type_sort_order_idx" ON "categories"("user_id", "type", "sort_order");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_from_currency_fkey" FOREIGN KEY ("from_currency") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_to_currency_fkey" FOREIGN KEY ("to_currency") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: composite (parent_id, user_id) keeps the parent in the same user's data; deleting
-- a parent deletes its subcategories.
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_user_id_fkey" FOREIGN KEY ("parent_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints beyond the Prisma DSL (database-architecture.md#3-constraints-beyond-prismas-dsl).
ALTER TABLE "users" ADD CONSTRAINT "users_maintenance_state_check"
    CHECK ("maintenance_state" IN ('BASE_CURRENCY_CHANGE'));

ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currencies_check"
    CHECK ("from_currency" <> "to_currency");
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_check"
    CHECK ("rate" > 0);
-- Manual rates belong to a user and have no provider; provider rates are global.
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_source_check"
    CHECK (
        ("source" = 'MANUAL' AND "user_id" IS NOT NULL AND "provider_id" IS NULL)
        OR ("source" = 'PROVIDER' AND "user_id" IS NULL AND "provider_id" IS NOT NULL)
    );
CREATE UNIQUE INDEX "exchange_rates_identity_key" ON "exchange_rates" (
    COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "source",
    COALESCE("provider_id", ''),
    "from_currency",
    "to_currency",
    "rate_date"
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 100);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_custom_kind_label_check"
    CHECK (("kind" = 'CUSTOM') = ("custom_kind_label" IS NOT NULL));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_custom_kind_label_length_check"
    CHECK (char_length("custom_kind_label") BETWEEN 1 AND 50);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opening_balance_check"
    CHECK (abs("opening_balance") < 1000000000000000);

ALTER TABLE "categories" ADD CONSTRAINT "categories_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 100);
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_check"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- Category hierarchy (database-architecture.md#3-constraints-beyond-prismas-dsl): at most two
-- levels, a parent must be top level, a subcategory has its parent's type. Services check the same
-- rules first and return CATEGORY_* error codes; this trigger is defense in depth.
CREATE FUNCTION "categories_hierarchy_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    parent_row RECORD;
BEGIN
    IF NEW."parent_id" IS NOT NULL THEN
        SELECT "parent_id", "type" INTO parent_row
            FROM "categories" WHERE "id" = NEW."parent_id" AND "user_id" = NEW."user_id";
        IF FOUND THEN
            IF parent_row."parent_id" IS NOT NULL THEN
                RAISE EXCEPTION 'category depth exceeded' USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'categories_depth_check';
            END IF;
            IF parent_row."type" <> NEW."type" THEN
                RAISE EXCEPTION 'subcategory type differs from its parent' USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'categories_type_check';
            END IF;
        END IF;
        IF EXISTS (SELECT 1 FROM "categories" WHERE "parent_id" = NEW."id") THEN
            RAISE EXCEPTION 'a category with subcategories cannot become a subcategory'
                USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_depth_check';
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW."type" <> OLD."type" THEN
        IF EXISTS (SELECT 1 FROM "categories" WHERE "parent_id" = NEW."id" AND "type" <> NEW."type") THEN
            RAISE EXCEPTION 'subcategory type differs from its parent' USING ERRCODE = 'check_violation',
                CONSTRAINT = 'categories_type_check';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "categories_hierarchy_check"
    BEFORE INSERT OR UPDATE OF "parent_id", "type" ON "categories"
    FOR EACH ROW EXECUTE FUNCTION "categories_hierarchy_check"();
