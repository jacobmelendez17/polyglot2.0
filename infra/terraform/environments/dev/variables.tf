variable "aws_region" {
  description = "Matches the dev Neon database's own AWS region, so the future Lambda runs beside the database it calls (see progress-tracker.md)."
  type        = string
  default     = "us-west-2"
}

variable "allowed_upload_origins" {
  description = "Origins allowed to upload directly to the dev S3 bucket. Includes local dev by default; add the Vercel preview URL(s) once preview deploys need real uploads."
  type        = list(string)
  default     = ["http://localhost:3000"]
}
