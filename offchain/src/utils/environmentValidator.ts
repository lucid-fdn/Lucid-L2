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
