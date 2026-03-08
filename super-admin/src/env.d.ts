interface CloudflareEnv {
  MASTER_DB: D1Database;
  R2_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  SUPER_ADMIN_EMAIL: string;
  SUPER_ADMIN_PASSWORD: string;
}
