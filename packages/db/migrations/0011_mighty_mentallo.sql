ALTER TYPE "public"."audit_action" ADD VALUE 'user.role_changed';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp with time zone;