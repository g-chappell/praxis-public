ALTER TYPE "public"."audit_action" ADD VALUE 'connector.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'connector.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'connector.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'connector.template_changed';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"command_ref" text NOT NULL,
	"args" jsonb,
	"credentials_encrypted" text,
	"usage_cap" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "mcp_connectors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_mcp_connectors" (
	"template_id" text NOT NULL,
	"connector_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowed_commands" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "template_mcp_connectors_template_id_connector_id_pk" PRIMARY KEY("template_id","connector_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_connectors" ADD CONSTRAINT "mcp_connectors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_mcp_connectors" ADD CONSTRAINT "template_mcp_connectors_connector_id_mcp_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."mcp_connectors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
