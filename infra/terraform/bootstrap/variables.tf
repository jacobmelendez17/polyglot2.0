variable "aws_region" {
  description = "Matches infra/terraform/environments/production's own region — see that module's variables.tf."
  type        = string
  default     = "us-west-2"
}

variable "github_repository" {
  description = "\"owner/repo\" this OIDC role trusts (spec 23's AWS Authentication from GitHub) — e.g. \"jacobmelendez17/polyglot2.0\". Only workflow runs triggered from this exact repository's `main` branch can assume the role."
  type        = string
}
