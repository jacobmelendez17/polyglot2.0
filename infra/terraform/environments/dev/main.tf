terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local state deliberately, for now — this is a single-operator dev/sandbox
  # AWS account (spec 19 §36's cost-guardrail philosophy extends to Terraform
  # itself: no remote-state bucket/lock table until more than one person
  # needs to run this). Revisit if a second operator or CI needs to apply
  # this configuration.
}

provider "aws" {
  region = var.aws_region
}

module "curriculum_import" {
  source = "../../modules/curriculum-import"

  environment            = "development"
  allowed_upload_origins = var.allowed_upload_origins
}
