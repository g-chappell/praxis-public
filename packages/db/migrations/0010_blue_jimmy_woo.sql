CREATE TABLE IF NOT EXISTS "mcp_usage" (
	"project_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mcp_usage_project_id_tool_day_pk" PRIMARY KEY("project_id","tool","day")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_usage" ADD CONSTRAINT "mcp_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
