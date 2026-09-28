CREATE TABLE "curriculum_import_row_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"corrections" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_import_row_corrections_import_row_idx" UNIQUE("import_id","row_number")
);
--> statement-breakpoint
ALTER TABLE "curriculum_import_row_corrections" ADD CONSTRAINT "curriculum_import_row_corrections_import_id_curriculum_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."curriculum_imports"("id") ON DELETE cascade ON UPDATE no action;