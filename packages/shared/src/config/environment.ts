import fs from 'fs';

/**
 * Read a secret from a Docker secret file or environment variable.
 * Docker convention: if JWT_SECRET_FILE is set, read from that file path.
 * Falls back to the direct environment variable.
 */
function readSecret(envVar: string, fileVar: string, defaultValue?: string): string {
  const filePath = process.env[fileVar];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8').trim();
    } catch {
      // Fall through to env var
    }
  }
  return process.env[envVar] || defaultValue || '';
}

export interface Environment {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;

  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_SSL?: boolean;

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;

  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;

  MINIO_ENDPOINT: string;
  MINIO_PORT: number;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET: string;

  ELASTICSEARCH_URL: string;

  CORS_ORIGIN: string;

  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;

  SENDGRID_API_KEY?: string;

  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_BUCKET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  FAWRY_MERCHANT_CODE?: string;
  FAWRY_SECURITY_KEY?: string;
  INSTAPAY_WALLET?: string;

  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  WHATSAPP_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;

  SENTRY_DSN?: string;
  APP_VERSION?: string;
  BACKUP_S3_BUCKET?: string;
  BACKUP_ENCRYPTION_KEY?: string;
  BACKUP_RETENTION?: string;

  // Encryption
  ENCRYPTION_KEY: string;

  APP_URL: string;

  // Auth configuration
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY_DAYS: number;
  BCRYPT_ROUNDS: number;
  MAX_LOGIN_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  MAX_CONCURRENT_SESSIONS: number;
  COOKIE_SECURE: boolean;
  CSRF_SECRET: string;
}

export function getEnv(): Environment {
  return {
    NODE_ENV: (process.env.NODE_ENV as Environment['NODE_ENV']) || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || '0.0.0.0',
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
    DB_NAME: process.env.DB_NAME || 'healthcare',
    DB_USER: process.env.DB_USER || 'postgres',
    DB_PASSWORD: readSecret('DB_PASSWORD', 'DB_PASSWORD_FILE', 'postgres'),
    DB_SSL: process.env.DB_SSL === "true",
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    JWT_SECRET: readSecret('JWT_SECRET', 'JWT_SECRET_FILE', 'dev-secret-change-in-production'),
    JWT_REFRESH_SECRET: readSecret('JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET_FILE', 'dev-refresh-secret-change-in-production'),
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
    MINIO_PORT: parseInt(process.env.MINIO_PORT || '9000', 10),
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin',
    MINIO_BUCKET: process.env.MINIO_BUCKET || 'healthcare',
    ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    SMTP_HOST: process.env.SMTP_HOST || 'localhost',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'no-reply@localhost',
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || 'documents',

    // Auth configuration
    ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '1h',
    REFRESH_TOKEN_EXPIRY_DAYS: parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10),
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '14', 10),
    MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
    MAX_CONCURRENT_SESSIONS: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5', 10),
    // Default to secure cookies in production, but allow explicit override for
    // local HTTP deployments (e.g. Docker on a LAN without TLS).
    COOKIE_SECURE: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    CSRF_SECRET: process.env.CSRF_SECRET || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    FAWRY_MERCHANT_CODE: process.env.FAWRY_MERCHANT_CODE,
    FAWRY_SECURITY_KEY: process.env.FAWRY_SECURITY_KEY,
    INSTAPAY_WALLET: process.env.INSTAPAY_WALLET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    APP_URL: process.env.APP_URL || 'http://localhost:5173',
    WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    BACKUP_S3_BUCKET: process.env.BACKUP_S3_BUCKET,
    BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY,
    BACKUP_RETENTION: process.env.BACKUP_RETENTION || '7',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  };
}


// ============================================
// Startup Validation — Fail Fast on Missing Secrets
// ============================================

const INSECURE_DEFAULTS = [
  "dev-secret-change-in-production",
  "dev-refresh-secret-change-in-production",
  "CHANGE_ME",
  "CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32",
  "CHANGE_ME_GENERATE_A_DIFFERENT_openssl_rand_hex_32",
  "CHANGE_ME_USE_STRONG_PASSWORD",
  "minioadmin",
  "Omar2009!",
];

export function validateProductionEnvironment(): void {
  const envVars = getEnv();
  if (envVars.NODE_ENV !== "production") return;

  const errors: string[] = [];

  if (!process.env.JWT_SECRET || INSECURE_DEFAULTS.includes(process.env.JWT_SECRET)) {
    errors.push("JWT_SECRET is missing or set to an insecure default value.");
  }
  if (!process.env.JWT_REFRESH_SECRET || INSECURE_DEFAULTS.includes(process.env.JWT_REFRESH_SECRET)) {
    errors.push("JWT_REFRESH_SECRET is missing or set to an insecure default value.");
  }
  if (
    process.env.JWT_SECRET &&
    process.env.JWT_REFRESH_SECRET &&
    process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    errors.push("JWT_SECRET and JWT_REFRESH_SECRET must be different values.");
  }
  if (!process.env.DB_PASSWORD || INSECURE_DEFAULTS.includes(process.env.DB_PASSWORD)) {
    errors.push("DB_PASSWORD is missing or set to an insecure default value.");
  }
  if (!process.env.CSRF_SECRET || process.env.CSRF_SECRET.length < 32) {
    errors.push("CSRF_SECRET must be set and at least 32 characters in production.");
  }
  if (envVars.CORS_ORIGIN === "*") {
    errors.push("CORS_ORIGIN must not be '*' in production. Set specific allowed origins.");
  }
  if (
    process.env.MINIO_ACCESS_KEY === "minioadmin" ||
    process.env.MINIO_SECRET_KEY === "minioadmin"
  ) {
    errors.push("MinIO credentials must not be default 'minioadmin' values in production.");
  }

  if (errors.length > 0) {
    console.error("========================================");
    console.error("FATAL: Production environment validation failed");
    console.error("========================================");
    errors.forEach((err) => console.error(`  ✗ ${err}`));
    console.error("========================================");
    console.error("Fix the above issues and restart the server.");
    console.error("========================================");
    process.exit(1);
  }
}

// ============================================
// Development Environment Validation — Warnings Only
// ============================================

export function validateDevelopmentEnvironment(): void {
  const envVars = getEnv();
  if (envVars.NODE_ENV !== "development") return;

  const warnings: string[] = [];

  // Warn about same JWT secrets
  if (
    process.env.JWT_SECRET &&
    process.env.JWT_REFRESH_SECRET &&
    process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    warnings.push("JWT_SECRET and JWT_REFRESH_SECRET are the same. Use different values for security.");
  }

  // Warn about CORS wildcard
  if (envVars.CORS_ORIGIN === "*") {
    warnings.push("CORS_ORIGIN is set to '*'. This is fine for development but restrict in production.");
  }

  // Warn about default MinIO credentials
  if (
    process.env.MINIO_ACCESS_KEY === "minioadmin" ||
    process.env.MINIO_SECRET_KEY === "minioadmin"
  ) {
    warnings.push("MinIO is using default 'minioadmin' credentials. Change for any shared dev environment.");
  }

  // Warn about default DB password
  if (!process.env.DB_PASSWORD || INSECURE_DEFAULTS.includes(process.env.DB_PASSWORD)) {
    warnings.push("DB_PASSWORD is using a default value. Set a strong password if connecting to a shared database.");
  }

  // Warn about empty SMTP (email won't work)
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    warnings.push("SMTP_USER or SMTP_PASS is not set. Email sending will fail.");
  }

  if (warnings.length > 0) {
    console.warn("⚠ Development environment warnings:");
    warnings.forEach((w) => console.warn(`  - ${w}`));
    console.warn("(These are warnings, not errors. The server will start.)");
  }
}
