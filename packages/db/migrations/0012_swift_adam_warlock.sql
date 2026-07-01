ALTER TYPE "public"."audit_action" ADD VALUE 'user.banned';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'user.unbanned';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'blocklist.added';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'blocklist.removed';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value" text NOT NULL,
	"is_domain" boolean DEFAULT false NOT NULL,
	"reason" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "email_blocklist_value_unique" UNIQUE("value")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_blocklist" ADD CONSTRAINT "email_blocklist_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
