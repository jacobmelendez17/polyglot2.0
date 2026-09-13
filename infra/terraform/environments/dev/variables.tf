variable "aws_region" {
  description = "Matches the dev Neon database's own AWS region, so the future Lambda runs beside the database it calls (see progress-tracker.md)."
  type        = string
  default     = "us-west-2"
}

variable "allowed_upload_origins" {
  description = "Origins allowed to upload directly to the dev S3 bucket. `next dev` picks the first free port starting at 3000 (progress-tracker.md's Environment Notes) — 3000/3001/3002 covers local dev in practice; add the Vercel preview URL(s) once preview deploys need real uploads."
  type        = list(string)
  default     = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
}
