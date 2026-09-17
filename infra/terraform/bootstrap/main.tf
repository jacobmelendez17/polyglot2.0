terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Deliberately local state, and deliberately the only Terraform config in
  # this repository allowed to stay that way. This config's entire purpose
  # is to create the S3 bucket + DynamoDB table that `environments/production`
  # uses as ITS remote backend (spec 23's "Production Terraform state must
  # use protected remote state") — the backend storage can't bootstrap
  # itself. Run this once (or whenever the bootstrap resources themselves
  # need to change), by the repository owner, from their own AWS
  # credentials. See progress-tracker.md's spec 23 entry for the exact
  # commands.
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Remote state backend for infra/terraform/environments/production.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "terraform_state" {
  bucket = "polyglot-terraform-state-${data.aws_caller_identity.current.account_id}"

  tags = {
    Project     = "polyglot"
    Component   = "terraform-state"
    Environment = "production"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_lock" {
  name         = "polyglot-terraform-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Project     = "polyglot"
    Component   = "terraform-state"
    Environment = "production"
  }
}

# ---------------------------------------------------------------------------
# GitHub Actions OIDC — spec 23's "prefer OIDC and an AWS deployment role...
# do not create long-lived AWS access keys solely for GitHub Actions".
#
# Nothing in this repository's current workflow set (ci.yml, migrate.yml,
# e2e.yml, security.yml, deploy-production.yml) actually assumes this role —
# none of them touch AWS. It exists so the mechanism is ready, least-privilege
# from day one, the moment a future workflow needs to apply this Terraform
# configuration or deploy the curriculum-import Lambda from CI, rather than
# reaching for a static access key under time pressure then.
# ---------------------------------------------------------------------------

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Scoped to this exact repository, and only to workflow runs triggered
    # from `main` (matches deploy-production.yml's own trust boundary — a
    # pull-request-triggered workflow run must never be able to assume this).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "polyglot-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_trust.json

  tags = {
    Project     = "polyglot"
    Component   = "terraform-state"
    Environment = "production"
  }
}

# Least-privilege: only what's needed to plan/apply
# infra/terraform/environments/production (its own state backend, plus the
# curriculum-import module's resource types) — never `Resource: "*"`, never
# IAM beyond the one Lambda execution role this module itself creates.
data "aws_iam_policy_document" "github_actions_deploy_permissions" {
  statement {
    sid    = "TerraformStateBackend"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]
  }

  statement {
    sid       = "TerraformStateLock"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.terraform_lock.arn]
  }

  # Scoped by ARN naming pattern (`polyglot-prod-*`/`polyglot-production`),
  # matching the curriculum-import module's own naming convention
  # (infra/terraform/modules/curriculum-import/main.tf) — not a resource-tag
  # condition, which doesn't constrain the *creation* call for services like
  # S3/SQS/Lambda (the resource has no tags yet at creation time). One
  # statement per service so each can list only the actions that service
  # actually needs.
  statement {
    sid    = "CurriculumImportProductionBucket"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:GetBucket*",
      "s3:PutBucket*",
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::polyglot-prod-imports-*",
      "arn:aws:s3:::polyglot-prod-imports-*/*",
    ]
  }

  statement {
    sid       = "CurriculumImportProductionQueues"
    effect    = "Allow"
    actions   = ["sqs:*"]
    resources = ["arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:polyglot-prod-import-*"]
  }

  statement {
    sid       = "CurriculumImportProductionLambda"
    effect    = "Allow"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:polyglot-prod-curriculum-import"]
  }

  statement {
    sid    = "CurriculumImportProductionLambdaRole"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:PassRole",
      "iam:TagRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/polyglot-prod-curriculum-import"]
  }

  statement {
    sid       = "CurriculumImportProductionParameter"
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/polyglot/production/*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy_permissions" {
  name   = "polyglot-production-infrastructure"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy_permissions.json
}
