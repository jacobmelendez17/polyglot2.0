output "bucket_name" {
  description = "The created S3 bucket's name — set as the app's IMPORT_BUCKET env var (spec 19 §42)."
  value       = aws_s3_bucket.curriculum_imports.id
}

output "bucket_arn" {
  value = aws_s3_bucket.curriculum_imports.arn
}
