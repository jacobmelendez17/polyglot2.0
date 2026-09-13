output "bucket_name" {
  description = "The created S3 bucket's name — set as the app's IMPORT_BUCKET env var (spec 19 §42)."
  value       = aws_s3_bucket.curriculum_imports.id
}

output "bucket_arn" {
  value = aws_s3_bucket.curriculum_imports.arn
}

output "queue_url" {
  description = "The SQS queue URL — the Lambda's event-source mapping (spec 19 §48 step 11) will point at this."
  value       = aws_sqs_queue.curriculum_import_queue.id
}

output "queue_arn" {
  value = aws_sqs_queue.curriculum_import_queue.arn
}

output "dlq_arn" {
  value = aws_sqs_queue.curriculum_import_dlq.arn
}

output "lambda_role_arn" {
  description = "The curriculum-import Lambda's execution role — the future `aws_lambda_function` resource (spec 19 §48 steps 8-10) will reference this."
  value       = aws_iam_role.curriculum_import_lambda.arn
}

output "lambda_function_name" {
  value = aws_lambda_function.curriculum_import.function_name
}

output "database_url_parameter_name" {
  description = "Run `aws ssm put-parameter --name <this> --value <real DATABASE_URL> --type SecureString --overwrite` once after the first apply — Terraform never sets the real value (see main.tf)."
  value       = aws_ssm_parameter.database_url.name
}
