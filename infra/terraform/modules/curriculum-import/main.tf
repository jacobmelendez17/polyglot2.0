terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Spec 19 §41 — Infrastructure as Code. This module currently defines only
# the S3 side of the pipeline (spec 19 §48 step 5); SQS, the dead-letter
# queue, the Lambda function, and its IAM role/policies are separate later
# steps in that same migration sequence and are added to this module as they
# ship, rather than stubbed out ahead of time (code-standards.md: no
# half-finished implementations).
#
# Bucket names must be globally unique across all of AWS, not just this
# account — the literal names spec 19 §28 uses as examples
# ("polyglot-dev-imports") are illustrative, not literal, so the account ID
# is folded in here to guarantee uniqueness without a human having to pick
# one.

data "aws_caller_identity" "current" {}

locals {
  bucket_name = "polyglot-${var.environment == "production" ? "prod" : "dev"}-imports-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "curriculum_imports" {
  bucket = local.bucket_name

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

# Spec 19 §45 — "S3 bucket is not public" / "public ACLs are disabled".
resource "aws_s3_bucket_public_access_block" "curriculum_imports" {
  bucket = aws_s3_bucket.curriculum_imports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Spec 19 §45 — upload URLs expire, but that alone doesn't stop a
# non-presigned plaintext request; deny any request that isn't over TLS.
resource "aws_s3_bucket_policy" "curriculum_imports" {
  bucket = aws_s3_bucket.curriculum_imports.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.curriculum_imports.arn,
          "${aws_s3_bucket.curriculum_imports.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Spec 19 §24 — source objects expire automatically after the retention
# window; import *history* (Neon) outlives them, by design.
resource "aws_s3_bucket_lifecycle_configuration" "curriculum_imports" {
  bucket = aws_s3_bucket.curriculum_imports.id

  rule {
    id     = "expire-source-objects"
    status = "Enabled"

    filter {
      prefix = "imports/"
    }

    expiration {
      days = var.source_retention_days
    }
  }
}

# CORS so the browser can PUT directly to a presigned URL from the Admin
# origin (spec 19 §6 — "The browser uploads directly to S3"). Methods/headers
# kept minimal: only what a presigned PUT upload needs.
resource "aws_s3_bucket_cors_configuration" "curriculum_imports" {
  bucket = aws_s3_bucket.curriculum_imports.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = var.allowed_upload_origins
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}
