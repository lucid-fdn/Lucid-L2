// Error Handler for Lucid L2 Browser Extension
// Provides standardized error handling and user notifications

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface ErrorDetails {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  action?: string;
  recoverable: boolean;
  context?: string;
}

class ErrorHandler {
  /**
   * Handle an error with appropriate categorization and user notification
   */
  handle(error: Error | string, context?: string): ErrorDetails {
    const details = this.categorizeError(error, context);
    
    // Log to console with severity prefix
    const logPrefix = `[${details.severity.toUpperCase()}]`;
    console.error(`${logPrefix} ${context || 'Unknown'}:`, details.message);
    
    // Show user notification
    this.notifyUser(details);
    
    return details;
  }

  /**
   * Categorize error and determine appropriate response
   */
  private categorizeError(error: Error | string, context?: string): ErrorDetails {
    const message = typeof error === 'string' ? error : error.message;
    
    // Network errors
    if (this.isNetworkError(message)) {
      return {
        message: 'Unable to connect to Lucid L2 API. Please check your connection.',
        code: 'NETWORK_ERROR',
        severity: ErrorSeverity.ERROR,
        action: 'Retry',
        recoverable: true,
        context
      };
    }
    
    // Wallet errors
    if (this.isWalletError(message)) {
      return {
        message: 'Wallet connection failed. Please reconnect your wallet.',
        code: 'WALLET_ERROR',
        severity: ErrorSeverity.WARNING,
        action: 'Reconnect Wallet',
        recoverable: true,
        context
      };
    }
    
    // API errors
    if (this.isAPIError(message)) {
      return {
        message: 'API request failed. Please try again.',
        code: 'API_ERROR',
        severity: ErrorSeverity.ERROR,
        action: 'Retry',
        recoverable: true,
        context
      };
    }
    
    // Storage errors
    if (this.isStorageError(message)) {
      return {
        message: 'Storage operation failed. Your data may not be saved.',
        code: 'STORAGE_ERROR',
        severity: ErrorSeverity.WARNING,
        action: 'Retry',
        recoverable: true,
        context
      };
    }
    
    // Authentication errors
    if (this.isAuthError(message)) {
      return {
        message: 'Authentication failed. Please log in again.',
        code: 'AUTH_ERROR',
        severity: ErrorSeverity.ERROR,
        action: 'Log In',
        recoverable: true,
        context
      };
    }
    
    // Generic error
    return {
      message: 'An unexpected error occurred. Please try again.',
      code: 'UNKNOWN_ERROR',
      severity: ErrorSeverity.ERROR,
      action: 'Retry',
      recoverable: false,
      context
    };
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(message: string): boolean {
    const networkKeywords = ['fetch', 'network', 'connection', 'timeout', 'offline'];
    return networkKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is wallet-related
   */
  private isWalletError(message: string): boolean {
    const walletKeywords = ['wallet', 'privy', 'phantom', 'solana', 'signature'];
    return walletKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is API-related
   */
  private isAPIError(message: string): boolean {
    const apiKeywords = ['api', '400', '401', '403', '404', '500', '502', '503'];
    return apiKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is storage-related
   */
  private isStorageError(message: string): boolean {
    const storageKeywords = ['storage', 'quota', 'disk', 'save', 'load'];
    return storageKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthError(message: string): boolean {
    const authKeywords = ['auth', 'unauthorized', 'forbidden', 'token', 'session'];
    return authKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Notify user about error via chrome.runtime.sendMessage
   */
  private notifyUser(details: ErrorDetails): void {
    try {
      // Send message to background/content script to show error
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'show_error',
          payload: details
        }).catch(() => {
          // Fallback: log if messaging fails
          console.warn('Could not send error notification to UI');
        });
      }
    } catch (e) {
      // Silently fail - don't throw errors in error handler
      console.warn('Error notification failed:', e);
    }
  }

  /**
   * Create a user-friendly error message
   */
  getUserMessage(error: Error | string): string {
    const details = this.categorizeError(error);
    return details.message;
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(error: Error | string): boolean {
    const details = this.categorizeError(error);
    return details.recoverable;
  }
}

// Create singleton instance
export const errorHandler = new ErrorHandler();

/**
 * Wrapper for async operations with error handling
 * Usage: const result = await handleAsync(() => someAsyncOperation(), 'Operation Context');
 */
export async function handleAsync<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    errorHandler.handle(error as Error, context);
    return null;
  }
}

/**
 * Wrapper for sync operations with error handling
 * Usage: const result = handleSync(() => someSyncOperation(), 'Operation Context');
 */
export function handleSync<T>(
  operation: () => T,
  context?: string
): T | null {
  try {
    return operation();
  } catch (error) {
    errorHandler.handle(error as Error, context);
    return null;
  }
}

/**
 * Type guard to check if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Format error for logging
 */
export function formatError(error: Error | string): string {
  if (typeof error === 'string') {
    return error;
  }
  return `${error.name}: ${error.message}${error.stack ? '\n' + error.stack : ''}`;
}
