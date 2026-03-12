/**
 * Environment Variable Validator
 * Validates all required environment variables on startup
 * Prevents application from starting with invalid/missing configuration
 */

interface ValidationRule {
  name: string;
  required: boolean;
  validator?: (value: string) => boolean;
  errorMessage?: string;
}

const VALIDATION_RULES: ValidationRule[] = [
  // Privy Configuration
  {
    name: 'PRIVY_APP_ID',
    required: true,
    validator: (v) => v.length > 10,
    errorMessage: 'PRIVY_APP_ID must be a valid Privy application ID'
  },
  {
    name: 'PRIVY_APP_SECRET',
    required: true,
    validator: (v) => v.length > 20,
    errorMessage: 'PRIVY_APP_SECRET must be a valid secret key'
  },
  {
    name: 'PRIVY_AUTH_PRIVATE_KEY',
    required: true,
    validator: (v) => v.length > 50,
    errorMessage: 'PRIVY_AUTH_PRIVATE_KEY must be a valid ECDSA private key'
  },
  {
    name: 'PRIVY_KEY_QUORUM_ID',
    required: true,
    validator: (v) => v.length > 10,
    errorMessage: 'PRIVY_KEY_QUORUM_ID must be a valid key quorum ID'
  },
  {
    name: 'PRIVY_SIGNER_ENCRYPTION_KEY',
    required: true,
    validator: (v) => /^[0-9a-fA-F]{64}$/.test(v),
    errorMessage: 'PRIVY_SIGNER_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes). Generate with: openssl rand -hex 32'
  },
  
  // Nango Configuration
  {
    name: 'NANGO_SECRET_KEY',
    required: true,
    validator: (v) => v.length > 20,
    errorMessage: 'NANGO_SECRET_KEY must be a valid Nango secret key'
  },
  {
    name: 'NANGO_API_URL',
    required: false,
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
    errorMessage: 'NANGO_API_URL must be a valid URL'
  },
  
  // Database Configuration
  {
    name: 'SUPABASE_URL',
    required: true,
    validator: (v) => v.startsWith('https://') && v.includes('supabase'),
    errorMessage: 'SUPABASE_URL must be a valid Supabase URL (https://...supabase.co)'
  },
  {
    name: 'SUPABASE_SERVICE_KEY',
    required: true,
    validator: (v) => v.startsWith('eyJ') && v.length > 100,
    errorMessage: 'SUPABASE_SERVICE_KEY must be a valid service role JWT token'
  },
  
  // Redis Configuration
  {
    name: 'REDIS_URL',
    required: true,
    validator: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    errorMessage: 'REDIS_URL must be a valid Redis connection URL (redis://...)'
  },
  
  // Security Configuration
  {
    name: 'N8N_HMAC_SECRET',
    required: true,
    validator: (v) => v.length >= 32,
    errorMessage: 'N8N_HMAC_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32'
  },
  {
    name: 'ADMIN_API_KEY',
    required: true,
    validator: (v) => v.length >= 32,
    errorMessage: 'ADMIN_API_KEY must be at least 32 characters. Generate with: openssl rand -hex 32'
  },
  
  // Optional but recommended
  {
    name: 'NODE_ENV',
    required: false,
    validator: (v) => ['development', 'production', 'test'].includes(v),
    errorMessage: 'NODE_ENV must be one of: development, production, test'
  },
  {
    name: 'PORT',
    required: false,
    validator: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0 && parseInt(v) < 65536,
    errorMessage: 'PORT must be a valid port number (1-65535)'
  }
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Soft Validations — warn-only checks for runtime env vars that have defaults
// or are conditionally required.  These never throw; they only append warnings.
// ---------------------------------------------------------------------------

/**
 * Helper: returns true when `value` represents a positive finite number.
 */
function isPositiveNumber(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Run soft (warn-only) validations against the current process.env.
 * Returns an array of warning strings.  Nothing here should cause startup
 * to fail — each message is purely informational.
 */
function runSoftValidations(): string[] {
  const warnings: string[] = [];

  // ── 1. Blockchain config (warn if missing, have defaults) ──────────────

  if (process.env.SOLANA_NETWORK && !process.env.SOLANA_RPC_URL) {
    warnings.push(
      `⚠️  SOLANA_NETWORK is set ("${process.env.SOLANA_NETWORK}") but SOLANA_RPC_URL is not — the default public RPC will be used`
    );
  }

  if (!process.env.ANCHORING_CHAINS) {
    warnings.push(
      '⚠️  ANCHORING_CHAINS is not set — defaulting to "solana-devnet"'
    );
  }

  // ── 2. Feature-flag format validation (when present) ───────────────────

  if (process.env.EVM_ENABLED_CHAINS) {
    const valid = process.env.EVM_ENABLED_CHAINS.split(',').every(
      (id) => id.trim().length > 0
    );
    if (!valid) {
      warnings.push(
        '⚠️  EVM_ENABLED_CHAINS contains empty segments — expected comma-separated chain IDs (e.g. "base,base-sepolia")'
      );
    }
  }

  if (process.env.ANCHORING_MOCK_MODE && !['true', 'false'].includes(process.env.ANCHORING_MOCK_MODE)) {
    warnings.push(
      `⚠️  ANCHORING_MOCK_MODE has invalid value "${process.env.ANCHORING_MOCK_MODE}" — must be "true" or "false"`
    );
  }

  if (process.env.X402_ENABLED && !['true', 'false'].includes(process.env.X402_ENABLED)) {
    warnings.push(
      `⚠️  X402_ENABLED has invalid value "${process.env.X402_ENABLED}" — must be "true" or "false"`
    );
  }

  // ── 3. Conditional requirements (feature enabled but dependency missing)

  if (process.env.AGENT_MIRROR_ENABLED === 'true' && !process.env.PLATFORM_CORE_DB_URL) {
    warnings.push(
      '⚠️  AGENT_MIRROR_ENABLED=true but PLATFORM_CORE_DB_URL is not set — agent mirroring will not function'
    );
  }

  if (process.env.X402_ENABLED === 'true') {
    const addr = process.env.X402_PAYMENT_ADDRESS;
    if (!addr || addr === ZERO_ADDRESS) {
      warnings.push(
        '⚠️  X402_ENABLED=true but X402_PAYMENT_ADDRESS is missing or set to the zero address — payments will fail'
      );
    }
  }

  if (process.env.RECEIPT_CONSUMER_ENABLED === 'true' && !process.env.PLATFORM_CORE_DB_URL) {
    warnings.push(
      '⚠️  RECEIPT_CONSUMER_ENABLED=true but PLATFORM_CORE_DB_URL is not set — receipt consumption may not function correctly'
    );
  }

  // ── 4. Numeric validation (warn if non-numeric when present) ───────────

  const numericVars: Array<{ name: string; label: string }> = [
    { name: 'ANCHORING_JOB_INTERVAL_MS', label: 'anchoring job interval' },
    { name: 'EPOCH_FINALIZATION_INTERVAL_MS', label: 'epoch finalization interval' },
    { name: 'RECEIPT_CONSUMER_INTERVAL_MS', label: 'receipt consumer interval' },
    { name: 'RECEIPT_CONSUMER_BATCH_SIZE', label: 'receipt consumer batch size' },
  ];

  for (const { name, label } of numericVars) {
    const val = process.env[name];
    if (val !== undefined && !isPositiveNumber(val)) {
      warnings.push(
        `⚠️  ${name} has non-numeric or non-positive value "${val}" — ${label} must be a positive number`
      );
    }
  }

  return warnings;
}

/**
 * Validate all environment variables
 * @throws Error if critical validation fails
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log('🔍 Validating environment variables...');
  
  for (const rule of VALIDATION_RULES) {
    const value = process.env[rule.name];
    
    // Check if required variable is missing
    if (rule.required && !value) {
      errors.push(`❌ Missing required environment variable: ${rule.name}`);
      if (rule.errorMessage) {
        errors.push(`   ${rule.errorMessage}`);
      }
      continue;
    }
    
    // Skip validation if optional and not provided
    if (!rule.required && !value) {
      warnings.push(`⚠️  Optional environment variable not set: ${rule.name}`);
      continue;
    }
    
    // Run custom validator if provided
    if (value && rule.validator && !rule.validator(value)) {
      errors.push(`❌ Invalid value for ${rule.name}`);
      if (rule.errorMessage) {
        errors.push(`   ${rule.errorMessage}`);
      }
    }
  }
  
  // Check for common misconfigurations
  if (process.env.NODE_ENV === 'production') {
    // Production-specific checks
    if (process.env.PRIVY_SIGNER_ENCRYPTION_KEY === 'default-key-change-me') {
      errors.push('❌ Cannot use default encryption key in production');
    }
    
    if (process.env.SUPABASE_URL?.includes('localhost')) {
      warnings.push('⚠️  Using localhost Supabase URL in production');
    }
    
    if (process.env.REDIS_URL?.includes('localhost')) {
      warnings.push('⚠️  Using localhost Redis URL in production');
    }
  }

  // Run soft validations (warn-only, never adds to errors)
  warnings.push(...runSoftValidations());

  // Print results
  const valid = errors.length === 0;
  
  if (valid) {
    console.log('✅ Environment validation passed');
    if (warnings.length > 0) {
      console.log('\nWarnings:');
      warnings.forEach(w => console.log(w));
    }
  } else {
    console.error('\n🚨 Environment validation FAILED:\n');
    errors.forEach(e => console.error(e));
    if (warnings.length > 0) {
      console.log('\nWarnings:');
      warnings.forEach(w => console.log(w));
    }
    console.error('\n💡 Fix these issues before starting the application.\n');
  }
  
  return { valid, errors, warnings };
}

/**
 * Validate environment and throw if invalid
 * Use this in your application entry point
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();
  
  if (!result.valid) {
    throw new Error(
      'Environment validation failed. Please check the errors above and configure missing/invalid environment variables.'
    );
  }
}

/**
 * Generate a template .env file with all required variables
 */
export function generateEnvTemplate(): string {
  const template: string[] = [
    '# Lucid L2 Environment Configuration',
    '# Generated on: ' + new Date().toISOString(),
    '',
    '# ============================================',
    '# PRIVY CONFIGURATION',
    '# ============================================',
    'PRIVY_APP_ID=your-privy-app-id-here',
    'PRIVY_APP_SECRET=your-privy-app-secret-here',
    'PRIVY_AUTH_PRIVATE_KEY=your-ecdsa-private-key-here',
    'PRIVY_KEY_QUORUM_ID=your-key-quorum-id-here',
    '# Generate with: openssl rand -hex 32',
    'PRIVY_SIGNER_ENCRYPTION_KEY=', 
    'PRIVY_API_BASE_URL=https://api.privy.io/v1',
    '',
    '# ============================================',
    '# NANGO CONFIGURATION',
    '# ============================================',
    'NANGO_SECRET_KEY=your-nango-secret-key-here',
    'NANGO_API_URL=http://localhost:3003',
    '',
    '# ============================================',
    '# DATABASE CONFIGURATION',
    '# ============================================',
    'SUPABASE_URL=https://your-project.supabase.co',
    'SUPABASE_SERVICE_KEY=your-supabase-service-key-here',
    '',
    '# ============================================',
    '# REDIS CONFIGURATION',
    '# ============================================',
    'REDIS_URL=redis://localhost:6379',
    '',
    '# ============================================',
    '# SECURITY CONFIGURATION',
    '# ============================================',
    '# Generate with: openssl rand -hex 32',
    'N8N_HMAC_SECRET=',
    '# Generate with: openssl rand -hex 32',
    'ADMIN_API_KEY=',
    '',
    '# ============================================',
    '# APPLICATION CONFIGURATION',
    '# ============================================',
    'NODE_ENV=development',
    'PORT=3000',
    ''
  ];
  
  return template.join('\n');
}

/**
 * Print environment status (safe for logging - no secrets)
 */
export function printEnvironmentStatus(): void {
  console.log('\n📋 Environment Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const rule of VALIDATION_RULES) {
    const value = process.env[rule.name];
    const status = value ? '✓' : (rule.required ? '✗' : '○');
    const maskedValue = value 
      ? (value.length > 20 ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}` : '***')
      : 'NOT SET';
    
    console.log(`${status} ${rule.name.padEnd(35)} ${rule.required ? '[REQUIRED]' : '[OPTIONAL]'.padEnd(10)} ${!value ? maskedValue : ''}`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
