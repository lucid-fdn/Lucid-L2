/**
 * OAuth Provider Types and Configuration
 * 
 * Defines the structure and configuration for OAuth providers integrated with Nango
 */

export type AuthType = 'oauth' | 'api_key' | 'manual';

export interface OAuthProvider {
  /** Unique provider key (e.g., 'google', 'slack') */
  key: string;
  
  /** Display name */
  name: string;
  
  /** Nango integration ID */
  integrationId: string;
  
  /** Authentication type */
  type: AuthType;
  
  /** Default OAuth scopes */
  scopes?: string[];
  
  /** Icon URL or path */
  icon?: string;
  
  /** Provider description */
  description: string;
  
  /** Whether provider is enabled */
  enabled: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface Credential {
  id: string;
  userId: string;
  service: string;
  name: string;
  authType: AuthType;
  nangoConnectionId?: string;
  metadata?: Record<string, any>;
  encryptedData?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialUsage {
  id: string;
  credentialId: string;
  workflowId?: string;
  workflowName?: string;
  executionId?: string;
  success: boolean;
  errorMessage?: string;
  usedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * OAuth Provider Registry
 * 
 * Central registry of all OAuth providers supported by the platform
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    key: 'google',
    name: 'Google',
    integrationId: 'google',
    type: 'oauth',
    scopes: [
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    icon: '/icons/google.svg',
    description: 'Connect your Google account for Gmail, Drive, and Calendar access',
    enabled: true,
    metadata: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
    }
  },

  slack: {
    key: 'slack',
    name: 'Slack',
    integrationId: 'slack',
    type: 'oauth',
    scopes: [
      'chat:write',
      'chat:write.public',
      'users:read',
      'channels:read',
      'channels:manage',
      'groups:read',
      'im:read',
      'mpim:read'
    ],
    icon: '/icons/slack.svg',
    description: 'Send messages and manage Slack channels',
    enabled: true,
    metadata: {
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access'
    }
  },

  github: {
    key: 'github',
    name: 'GitHub',
    integrationId: 'github',
    type: 'oauth',
    scopes: [
      'repo',
      'user',
      'workflow',
      'read:org',
      'read:packages'
    ],
    icon: '/icons/github.svg',
    description: 'Access repositories and manage workflows',
    enabled: true,
    metadata: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user'
    }
  },

  microsoft: {
    key: 'microsoft',
    name: 'Microsoft',
    integrationId: 'microsoft',
    type: 'oauth',
    scopes: [
      'User.Read',
      'Mail.Send',
      'Mail.ReadWrite',
      'Calendars.ReadWrite',
      'Files.ReadWrite.All'
    ],
    icon: '/icons/microsoft.svg',
    description: 'Access Microsoft 365 services (Outlook, OneDrive, Calendar)',
    enabled: true,
    metadata: {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    }
  },

  linear: {
    key: 'linear',
    name: 'Linear',
    integrationId: 'linear',
    type: 'oauth',
    scopes: ['read', 'write'],
    icon: '/icons/linear.svg',
    description: 'Create and manage Linear issues',
    enabled: true,
    metadata: {
      authUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      apiUrl: 'https://api.linear.app/graphql'
    }
  },

  notion: {
    key: 'notion',
    name: 'Notion',
    integrationId: 'notion',
    type: 'oauth',
    scopes: ['read_content', 'update_content', 'insert_content'],
    icon: '/icons/notion.svg',
    description: 'Read and write Notion pages and databases',
    enabled: true,
    metadata: {
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      apiUrl: 'https://api.notion.com/v1'
    }
  },

  airtable: {
    key: 'airtable',
    name: 'Airtable',
    integrationId: 'airtable',
    type: 'oauth',
    scopes: [
      'data.records:read',
      'data.records:write',
      'schema.bases:read'
    ],
    icon: '/icons/airtable.svg',
    description: 'Read and write Airtable bases',
    enabled: true,
    metadata: {
      authUrl: 'https://airtable.com/oauth2/v1/authorize',
      tokenUrl: 'https://airtable.com/oauth2/v1/token',
      apiUrl: 'https://api.airtable.com/v0'
    }
  },

  asana: {
    key: 'asana',
    name: 'Asana',
    integrationId: 'asana',
    type: 'oauth',
    scopes: ['default'],
    icon: '/icons/asana.svg',
    description: 'Manage Asana tasks and projects',
    enabled: true,
    metadata: {
      authUrl: 'https://app.asana.com/-/oauth_authorize',
      tokenUrl: 'https://app.asana.com/-/oauth_token',
      apiUrl: 'https://app.asana.com/api/1.0'
    }
  },

  // API Key providers (manual entry)
  openai: {
    key: 'openai',
    name: 'OpenAI',
    integrationId: 'openai',
    type: 'api_key',
    icon: '/icons/openai.svg',
    description: 'Use OpenAI GPT models and APIs',
    enabled: true,
    metadata: {
      apiUrl: 'https://api.openai.com/v1',
      keyFormat: 'sk-...',
      docs: 'https://platform.openai.com/docs/api-reference'
    }
  },

  stripe: {
    key: 'stripe',
    name: 'Stripe',
    integrationId: 'stripe',
    type: 'api_key',
    icon: '/icons/stripe.svg',
    description: 'Process payments and manage subscriptions',
    enabled: true,
    metadata: {
      apiUrl: 'https://api.stripe.com',
      keyFormat: 'sk_...',
      testKeyFormat: 'sk_test_...',
      docs: 'https://stripe.com/docs/api'
    }
  },

  sendgrid: {
    key: 'sendgrid',
    name: 'SendGrid',
    integrationId: 'sendgrid',
    type: 'api_key',
    icon: '/icons/sendgrid.svg',
    description: 'Send transactional emails',
    enabled: true,
    metadata: {
      apiUrl: 'https://api.sendgrid.com/v3',
      keyFormat: 'SG...',
      docs: 'https://docs.sendgrid.com/api-reference'
    }
  },

  anthropic: {
    key: 'anthropic',
    name: 'Anthropic',
    integrationId: 'anthropic',
    type: 'api_key',
    icon: '/icons/anthropic.svg',
    description: 'Use Claude AI models',
    enabled: true,
    metadata: {
      apiUrl: 'https://api.anthropic.com',
      keyFormat: 'sk-ant-...',
      docs: 'https://docs.anthropic.com/claude/reference'
    }
  }
};

/**
 * Get provider by key
 */
export function getProvider(key: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS[key];
}

/**
 * Get all enabled providers
 */
export function getEnabledProviders(): OAuthProvider[] {
  return Object.values(OAUTH_PROVIDERS).filter(p => p.enabled);
}

/**
 * Get providers by auth type
 */
export function getProvidersByType(type: AuthType): OAuthProvider[] {
  return Object.values(OAUTH_PROVIDERS).filter(p => p.type === type && p.enabled);
}

/**
 * Get OAuth providers only
 */
export function getOAuthProviders(): OAuthProvider[] {
  return getProvidersByType('oauth');
}

/**
 * Get API key providers only
 */
export function getApiKeyProviders(): OAuthProvider[] {
  return getProvidersByType('api_key');
}

/**
 * Validate provider exists and is enabled
 */
export function validateProvider(key: string): { valid: boolean; provider?: OAuthProvider; error?: string } {
  const provider = getProvider(key);
  
  if (!provider) {
    return {
      valid: false,
      error: `Provider '${key}' not found`
    };
  }
  
  if (!provider.enabled) {
    return {
      valid: false,
      error: `Provider '${key}' is not enabled`
    };
  }
  
  return {
    valid: true,
    provider
  };
}
