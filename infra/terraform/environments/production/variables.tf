variable "aws_region" {
  description = "Matches the production Neon database's own AWS region and infra/terraform/environments/dev's choice — same account, same region (spec 23's AWS locked decision: \"Use the existing AWS account and region\")."
  type        = string
  default     = "us-west-2"
}

variable "allowed_upload_origins" {
  description = "Origins allowed to upload directly to the production S3 bucket — the real production origin(s) only (the Vercel production *.vercel.app URL, and the eventual custom domain once spec 23's Clerk/domain exception is resolved). Deliberately has no default: a placeholder value here would be easy to forget to replace before the first apply."
  type        = list(string)
}
