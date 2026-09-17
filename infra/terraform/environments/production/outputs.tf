output "import_bucket_name" {
  value = module.curriculum_import.bucket_name
}

output "import_queue_url" {
  value = module.curriculum_import.queue_url
}

output "import_dlq_arn" {
  value = module.curriculum_import.dlq_arn
}

output "import_lambda_role_arn" {
  value = module.curriculum_import.lambda_role_arn
}

output "import_lambda_function_name" {
  value = module.curriculum_import.lambda_function_name
}

output "database_url_parameter_name" {
  value = module.curriculum_import.database_url_parameter_name
}
