output "state_bucket_name" {
  value = aws_s3_bucket.terraform_state.bucket
}

output "lock_table_name" {
  value = aws_dynamodb_table.terraform_lock.name
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
