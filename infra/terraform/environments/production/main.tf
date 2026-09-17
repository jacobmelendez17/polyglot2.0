terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Spec 23's "Production Terraform state must use protected remote state.
  # Do not commit production .tfstate files to Git." — unlike
  # environments/dev's deliberately local/committed state (a single-operator
  # sandbox), this backend is created once by infra/terraform/bootstrap and
  # never committed here itself (state files are gitignored — see
  # .gitignore's Terraform section). Fill in `bucket`/`dynamodb_table` from
  # that bootstrap's own outputs before the first `terraform init` — see
  # progress-tracker.md's spec 23 entry for the exact command.
  backend "s3" {
    bucket         = "REPLACE_WITH_BOOTSTRAP_OUTPUT_state_bucket_name"
    key            = "environments/production/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "polyglot-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

module "curriculum_import" {
  source = "../../modules/curriculum-import"

  environment            = "production"
  allowed_upload_origins = var.allowed_upload_origins
}
