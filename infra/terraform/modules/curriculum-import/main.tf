terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

data "aws_region" "current" {}

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

# ---------------------------------------------------------------------------
# SQS + dead-letter queue (spec 19 §48 steps 6-7). Standard queue, batch size
# 1 (§37 — configured on the future Lambda event-source mapping, not here),
# not FIFO: nothing about curriculum-import processing needs ordering, and
# spec 19 §37 says to use Standard "unless a concrete ordering requirement
# later proves FIFO necessary".
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "curriculum_import_dlq" {
  name = "polyglot-${var.environment == "production" ? "prod" : "dev"}-import-dlq"

  # Generous retention so a poisoned message stays inspectable rather than
  # silently expiring (spec 19 §23 — "No Lambda should continuously retry
  # poison messages forever", not "and then lose the evidence").
  message_retention_seconds = 1209600 # 14 days (SQS's own maximum)

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "curriculum_import_queue" {
  name = "polyglot-${var.environment == "production" ? "prod" : "dev"}-import-queue"

  # Must safely exceed the Lambda's own timeout (spec 19 §37) — AWS's own
  # guidance is at least 6x the function timeout, to cover retries within a
  # single visibility window rather than a message becoming visible again
  # (and re-delivered) while the first attempt is still legitimately running.
  visibility_timeout_seconds = var.lambda_timeout_seconds * 6

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.curriculum_import_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

# Lets this specific bucket (and no other) publish ObjectCreated
# notifications into this specific queue — least-privilege, scoped by both
# SourceArn and SourceAccount (spec 19 §33's "Resource permissions must be
# scoped to the Polyglot environment's actual queue/bucket ARNs"). The
# bucket-side notification resource itself is a later step (§48 step 11),
# once the Lambda consumer exists — this policy only prepares the queue to
# accept it.
resource "aws_sqs_queue_policy" "curriculum_import_queue_allows_s3" {
  queue_url = aws_sqs_queue.curriculum_import_queue.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowS3BucketNotification"
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.curriculum_import_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.curriculum_imports.arn
          }
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda execution role (spec 19 §33, §48 step 7) — created ahead of the
# Lambda function itself (§48 steps 8-10), so the role/policy shape is
# reviewed as its own change. No AWS managed policy is attached: attaching
# `AWSLambdaBasicExecutionRole` would grant `logs:CreateLogGroup`/
# `CreateLogStream`/`PutLogEvents`, which spec 19 §34's zero-cost logging
# policy explicitly withholds unless enabled later as its own deliberate
# decision.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "curriculum_import_lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "curriculum_import_lambda" {
  name               = "polyglot-${var.environment == "production" ? "prod" : "dev"}-curriculum-import"
  assume_role_policy = data.aws_iam_policy_document.curriculum_import_lambda_trust.json

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

# The minimum subset spec 19 §33 lists: consume this one queue, read objects
# under this one bucket's imports/ prefix, and (added alongside the Lambda
# function itself, below) read/decrypt exactly one SSM parameter. No
# CloudWatch Logs, no `Resource: "*"`, no access to any other bucket or
# queue.
data "aws_iam_policy_document" "curriculum_import_lambda_permissions" {
  statement {
    sid    = "ConsumeImportQueue"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.curriculum_import_queue.arn]
  }

  statement {
    sid       = "ReadImportSourceObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.curriculum_imports.arn}/imports/*"]
  }

  statement {
    sid       = "ReadDatabaseUrlParameter"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.database_url.arn]
  }

  statement {
    sid       = "DecryptDatabaseUrlParameter"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
  }
}

resource "aws_iam_role_policy" "curriculum_import_lambda_permissions" {
  name   = "curriculum-import-permissions"
  role   = aws_iam_role.curriculum_import_lambda.id
  policy = data.aws_iam_policy_document.curriculum_import_lambda_permissions.json
}

# ---------------------------------------------------------------------------
# DATABASE_URL, held in SSM Parameter Store rather than a plain Lambda
# environment variable (spec 19 §48 step 11, user decision 2026-09-12). This
# project's terraform.tfstate is deliberately committed to git (single-operator
# sandbox, no remote-state backend) — a Lambda environment variable's value
# is stored in state as plain text, so the real Neon connection string
# (password included) would end up in git history. `ignore_changes` means
# Terraform creates this parameter once with a placeholder and then never
# touches its value again; the real value is set exactly once, out-of-band,
# via `aws ssm put-parameter --overwrite` — never written to any file this
# repository tracks. `aws/lambda/curriculum-import/db.ts` fetches it at cold
# start using the parameter *name* (not secret), which Terraform does pass
# through as a normal environment variable below.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "database_url" {
  name        = "/polyglot/${var.environment}/curriculum-import/database-url"
  type        = "SecureString"
  value       = "REPLACE_ME_VIA_AWS_CLI"
  description = "Neon DATABASE_URL for the curriculum-import Lambda. Set out-of-band via `aws ssm put-parameter --overwrite` — Terraform never manages this value after creation."

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# The Lambda function itself (spec 19 §48 step 11) — `scripts/build-lambda.mjs`
# must run before `terraform apply` so the bundle this zips actually exists;
# `source_code_hash` is what makes `terraform plan` detect a rebuilt bundle
# and redeploy it.
# ---------------------------------------------------------------------------

data "archive_file" "lambda_package" {
  type        = "zip"
  source_file = "${path.module}/../../../../dist/lambda/curriculum-import/index.js"
  output_path = "${path.module}/../../../../dist/lambda/curriculum-import.zip"
}

resource "aws_lambda_function" "curriculum_import" {
  function_name = "polyglot-${var.environment == "production" ? "prod" : "dev"}-curriculum-import"
  role          = aws_iam_role.curriculum_import_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  # Spec 19 §36's cost guardrails. `reserved_concurrent_executions` (the
  # spec's suggested value: 1) is deliberately omitted — this AWS account's
  # total concurrency limit is currently 10 (a new-account default; see
  # progress-tracker.md), and AWS refuses to let any function reserve
  # concurrency that would drop the account's shared unreserved pool below
  # that floor. Not a correctness requirement either way: the "never two
  # imports processing at once" guarantee that matters is already enforced
  # by the state-machine's own row-lock guards (`domains/admin/curriculum-import-service.ts`),
  # not by this setting. Revisit if the account's quota is ever raised.
  memory_size = 512
  timeout     = var.lambda_timeout_seconds

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      POLYGLOT_ENV                = var.environment
      DATABASE_URL_PARAMETER_NAME = aws_ssm_parameter.database_url.name
      # AWS_REGION is a Lambda-reserved environment variable the runtime sets
      # automatically — it cannot be (and is not) set here.
    }
  }

  tags = {
    Project     = "polyglot"
    Component   = "curriculum-import"
    Environment = var.environment
  }
}

# Batch size 1 (spec 19 §37) — one SQS message drives exactly one invocation.
resource "aws_lambda_event_source_mapping" "curriculum_import_queue" {
  event_source_arn = aws_sqs_queue.curriculum_import_queue.arn
  function_name    = aws_lambda_function.curriculum_import.arn
  batch_size       = 1
}

# S3 → SQS (spec 19 §1's diagram, §48 step 11) — deferred until now
# deliberately: enabling this before a Lambda consumed the queue would have
# let uploads accumulate unprocessed messages toward the DLQ for nothing.
# Depends explicitly on the queue policy (§33) that lets this bucket publish
# into this queue — S3 validates that permission exists at notification-config
# time, so this must not race ahead of it.
resource "aws_s3_bucket_notification" "curriculum_imports" {
  bucket = aws_s3_bucket.curriculum_imports.id

  queue {
    queue_arn     = aws_sqs_queue.curriculum_import_queue.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "imports/"
  }

  depends_on = [aws_sqs_queue_policy.curriculum_import_queue_allows_s3]
}
