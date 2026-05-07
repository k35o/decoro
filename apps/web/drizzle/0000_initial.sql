CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer NOT NULL,
	"messages" jsonb NOT NULL,
	"spec" jsonb NOT NULL,
	"parent_share_id" text
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text,
	"messages" jsonb NOT NULL,
	"spec" jsonb NOT NULL
);
