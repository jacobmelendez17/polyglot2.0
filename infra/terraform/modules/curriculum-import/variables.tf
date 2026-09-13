variable "environment" {
  description = "Polyglot environment this instance of the module belongs to (\"development\" or \"production\") — spec 19 §28's development/production isolation. Purely a naming/tagging input; it does not change which AWS account resources land in."
  type        = string

  validation {
    condition     = contains(["development", "production"], var.environment)
    error_message = "environment must be \"development\" or \"production\"."
  }
}

variable "source_retention_days" {
  description = "How long an uploaded source CSV/TSV object survives in S3 before the lifecycle rule expires it (spec 19 §24)."
  type        = number
  default     = 30
}

variable "allowed_upload_origins" {
  description = "Origins allowed to PUT directly to the bucket via a presigned URL (the Admin app's own origin(s) — e.g. http://localhost:3000 for local dev, the Vercel preview/production URL otherwise)."
  type        = list(string)
}
