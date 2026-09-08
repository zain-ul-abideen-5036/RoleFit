CREATE TYPE "public"."job_kind" AS ENUM('optimization');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'claimed', 'succeeded', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"run_id" uuid NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" varchar(120),
	"last_error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_run_id_optimization_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."optimization_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_claimable_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "jobs_user_idx" ON "jobs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_run_unique" ON "jobs" USING btree ("run_id");