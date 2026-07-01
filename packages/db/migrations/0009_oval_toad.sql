CREATE TYPE "public"."key_provider" AS ENUM('anthropic', 'openai');--> statement-breakpoint
DROP INDEX IF EXISTS "one_active_platform_key";--> statement-breakpoint
ALTER TABLE "platform_api_keys" ADD COLUMN "provider" "key_provider" DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_platform_key_per_provider" ON "platform_api_keys" USING btree ("provider") WHERE "platform_api_keys"."active";