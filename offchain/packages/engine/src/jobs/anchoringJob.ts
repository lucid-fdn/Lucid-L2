/**
 * Background Anchoring Job - Automatically commits epoch roots to the blockchain.
 * 
 * This job runs periodically (every 10 minutes by default) and:
 * 1. Checks if any epochs are ready for finalization
 * 2. Commits their roots to Solana
 * 3. Logs success/failure
 * 
 * Finalization triggers:
 * - Receipt count > 100
 * - Time since epoch start > 1 hour
 */
import {
  getEpochsReadyForFinalization,
  getFailedEpochs,
  retryEpoch,
  getEpochStats,
  Epoch,
} from '../epoch/services/epochService';
import {
  commitEpochRoot,
  checkAnchoringHealth,
  AnchorResult,
} from '../epoch/services/anchoringService';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface AnchoringJobConfig {
  enabled: boolean;
  interval_ms: number;         // How often to run (default: 10 minutes)
  batch_size: number;          // Max epochs to process per run (default: 5)
  retry_failed: boolean;       // Whether to retry failed epochs
  max_retry_attempts: number;  // Max retries per epoch before giving up (default: 3)
  max_consecutive_failures: number;  // Stop if too many failures in a row
  alert_webhook_url?: string;  // Webhook for failure alerts
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_CONFIG: AnchoringJobConfig = {
  enabled: true,
  interval_ms: 10 * 60 * 1000, // 10 minutes
  batch_size: 5,
  retry_failed: true,
  max_retry_attempts: 3,
  max_consecutive_failures: 3,
  log_level: 'info',
};

let config: AnchoringJobConfig = { ...DEFAULT_CONFIG };
let jobInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let consecutiveFailures = 0;
let lastRunTime: number | null = null;
let lastRunResult: AnchoringJobResult | null = null;

// =============================================================================
// TYPES
// =============================================================================

export interface AnchoringJobResult {
  success: boolean;
  run_time: number;
  epochs_checked: number;
  epochs_anchored: number;
  epochs_failed: number;
  epochs_retried: number;
  results: AnchorResult[];
  errors: string[];
}

export interface AnchoringJobStatus {
  enabled: boolean;
  running: boolean;
  interval_ms: number;
  last_run_time: number | null;
  last_run_result: AnchoringJobResult | null;
  consecutive_failures: number;
  next_run_in_ms: number | null;
}

// =============================================================================
// LOGGING
// =============================================================================

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  if (levels[level] >= levels[config.log_level]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [AnchoringJob] [${level.toUpperCase()}]`;
    if (data) {
      console[level](`${prefix} ${message}`, data);
    } else {
      console[level](`${prefix} ${message}`);
    }
  }
}

// =============================================================================
// CONFIGURATION MANAGEMENT
// =============================================================================

/**
 * Update job configuration.
 */
export function setAnchoringJobConfig(newConfig: Partial<AnchoringJobConfig>): void {
  const wasEnabled = config.enabled;
  config = { ...config, ...newConfig };
  
  // Restart job if interval changed while running
  if (jobInterval && newConfig.interval_ms && newConfig.interval_ms !== config.interval_ms) {
    stopAnchoringJob();
    if (config.enabled) {
      startAnchoringJob();
    }
  }
  
  // Start/stop based on enabled flag
  if (!wasEnabled && config.enabled) {
    startAnchoringJob();
  } else if (wasEnabled && !config.enabled) {
    stopAnchoringJob();
  }
}

/**
 * Get current job configuration.
 */
export function getAnchoringJobConfig(): AnchoringJobConfig {
  return { ...config };
}

// =============================================================================
// ALERT HANDLING
// =============================================================================

/**
 * Send an alert when anchoring fails.
 */
async function sendAlert(message: string, data?: any): Promise<void> {
  log('error', message, data);
  
  if (!config.alert_webhook_url) {
    return;
  }

  try {
    const payload = {
      timestamp: new Date().toISOString(),
      service: 'LucidLayer Anchoring Job',
      severity: 'error',
      message,
      data,
    };

    await fetch(config.alert_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    log('error', 'Failed to send alert webhook', error);
  }
}

// =============================================================================
// CORE JOB LOGIC
// =============================================================================

/**
 * Run the anchoring job once.
 */
export async function runAnchoringJob(): Promise<AnchoringJobResult> {
  const startTime = Date.now();
  const result: AnchoringJobResult = {
    success: true,
    run_time: 0,
    epochs_checked: 0,
    epochs_anchored: 0,
    epochs_failed: 0,
    epochs_retried: 0,
    results: [],
    errors: [],
  };

  // Check if already running (prevent concurrent runs)
  if (isRunning) {
    log('warn', 'Job already running, skipping this run');
    result.success = false;
    result.errors.push('Job already running');
    return result;
  }

  isRunning = true;
  lastRunTime = startTime;

  try {
    log('info', 'Starting anchoring job run');

    // Check anchoring service health
    const health = await checkAnchoringHealth();
    if (!health.connected && !health.mock_mode) {
      result.success = false;
      result.errors.push(`Anchoring service not healthy: ${health.error || 'Not connected'}`);
      log('error', 'Anchoring service not healthy', health);
      return result;
    }

    // Get epochs ready for finalization
    const readyEpochs = getEpochsReadyForFinalization();
    result.epochs_checked = readyEpochs.length;

    // Process epochs (up to batch_size)
    const epochsToProcess = readyEpochs.slice(0, config.batch_size);

    if (epochsToProcess.length === 0) {
      log('debug', 'No epochs ready for finalization');
    } else {
      log('info', `Found ${readyEpochs.length} epochs ready for finalization`);
    }

    for (const epoch of epochsToProcess) {
      try {
        log('info', `Anchoring epoch ${epoch.epoch_id} (${epoch.leaf_count} receipts)`);
        
        const anchorResult = await commitEpochRoot(epoch.epoch_id);
        result.results.push(anchorResult);

        if (anchorResult.success) {
          result.epochs_anchored++;
          log('info', `Successfully anchored epoch ${epoch.epoch_id}`, {
            tx: anchorResult.signature,
            root: anchorResult.root,
          });

          // Write to outbox for platform-core consumption (reverse signaling)
          if (epoch.agent_passport_id) {
            try {
              const { writeEpochAnchoredEvent } = await import('./epochAnchoredOutbox');
              await writeEpochAnchoredEvent({
                epoch_id: epoch.epoch_id,
                agent_passport_id: epoch.agent_passport_id,
                mmr_root: anchorResult.root || epoch.mmr_root || '',
                chain_tx: anchorResult.signature || '',
              });
            } catch (err) {
              log('warn', `Failed to write epoch_anchored_event for ${epoch.epoch_id}`, err);
            }
          }
        } else {
          result.epochs_failed++;
          result.errors.push(`Failed to anchor epoch ${epoch.epoch_id}: ${anchorResult.error}`);
          log('error', `Failed to anchor epoch ${epoch.epoch_id}`, anchorResult);
        }
      } catch (error) {
        result.epochs_failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Exception anchoring epoch ${epoch.epoch_id}: ${errorMsg}`);
        log('error', `Exception anchoring epoch ${epoch.epoch_id}`, error);
      }
    }

    // =========================================================================
    // RETRY FAILED EPOCHS
    // =========================================================================
    if (config.retry_failed) {
      const failedEpochs = getFailedEpochs();
      const retryable = failedEpochs.filter(
        e => (e.retry_count || 0) < config.max_retry_attempts
      );

      if (retryable.length > 0) {
        log('info', `Found ${retryable.length} failed epoch(s) eligible for retry (of ${failedEpochs.length} total failed)`);

        // Respect batch_size: count slots remaining after the main batch
        const slotsUsed = epochsToProcess.length;
        const slotsRemaining = Math.max(0, config.batch_size - slotsUsed);
        const retryBatch = retryable.slice(0, slotsRemaining);

        for (const failedEpoch of retryBatch) {
          try {
            const attempt = (failedEpoch.retry_count || 0) + 1;
            log('info', `Retrying failed epoch ${failedEpoch.epoch_id} (attempt ${attempt}/${config.max_retry_attempts})`);

            // Reset epoch from 'failed' back to 'open'
            const resetEpoch = retryEpoch(failedEpoch.epoch_id);
            if (!resetEpoch) {
              log('warn', `Could not reset epoch ${failedEpoch.epoch_id} for retry`);
              continue;
            }

            // Re-anchor the epoch
            const anchorResult = await commitEpochRoot(failedEpoch.epoch_id);
            result.results.push(anchorResult);
            result.epochs_retried++;

            if (anchorResult.success) {
              result.epochs_anchored++;
              log('info', `Successfully re-anchored epoch ${failedEpoch.epoch_id} on attempt ${attempt}`, {
                tx: anchorResult.signature,
                root: anchorResult.root,
              });
            } else {
              result.epochs_failed++;
              result.errors.push(`Retry failed for epoch ${failedEpoch.epoch_id} (attempt ${attempt}): ${anchorResult.error}`);
              log('warn', `Retry failed for epoch ${failedEpoch.epoch_id} (attempt ${attempt})`, anchorResult);
            }
          } catch (error) {
            result.epochs_failed++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Exception retrying epoch ${failedEpoch.epoch_id}: ${errorMsg}`);
            log('error', `Exception retrying epoch ${failedEpoch.epoch_id}`, error);
          }
        }
      }

      // Alert on permanently failed epochs (exhausted all retries)
      const exhausted = failedEpochs.filter(
        e => (e.retry_count || 0) >= config.max_retry_attempts
      );
      if (exhausted.length > 0) {
        log('warn', `${exhausted.length} epoch(s) have exhausted all ${config.max_retry_attempts} retry attempts`, {
          epoch_ids: exhausted.map(e => e.epoch_id),
        });
      }
    }

    // Update consecutive failures counter
    if (result.epochs_failed > 0 && result.epochs_anchored === 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= config.max_consecutive_failures) {
        await sendAlert(
          `Anchoring job has failed ${consecutiveFailures} times in a row`,
          { lastResult: result }
        );
      }
    } else {
      consecutiveFailures = 0;
    }

    result.success = result.epochs_failed === 0;
    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.success = false;
    result.errors.push(`Job exception: ${errorMsg}`);
    log('error', 'Anchoring job exception', error);
    
    consecutiveFailures++;
    if (consecutiveFailures >= config.max_consecutive_failures) {
      await sendAlert('Anchoring job exception', { error: errorMsg });
    }
    
    return result;

  } finally {
    result.run_time = Date.now() - startTime;
    lastRunResult = result;
    isRunning = false;
    
    log('info', `Anchoring job completed in ${result.run_time}ms`, {
      anchored: result.epochs_anchored,
      failed: result.epochs_failed,
    });
  }
}

// =============================================================================
// JOB LIFECYCLE
// =============================================================================

/**
 * Start the background anchoring job.
 */
export function startAnchoringJob(): void {
  if (jobInterval) {
    log('warn', 'Anchoring job already started');
    return;
  }

  if (!config.enabled) {
    log('info', 'Anchoring job is disabled');
    return;
  }

  log('info', `Starting anchoring job with interval ${config.interval_ms}ms`);
  
  // Run immediately on start
  runAnchoringJob().catch(error => {
    log('error', 'Initial anchoring job run failed', error);
  });

  // Then run at interval
  jobInterval = setInterval(() => {
    runAnchoringJob().catch(error => {
      log('error', 'Anchoring job run failed', error);
    });
  }, config.interval_ms);
}

/**
 * Stop the background anchoring job.
 */
export function stopAnchoringJob(): void {
  if (!jobInterval) {
    log('debug', 'Anchoring job not running');
    return;
  }

  log('info', 'Stopping anchoring job');
  clearInterval(jobInterval);
  jobInterval = null;
}

/**
 * Get the current status of the anchoring job.
 */
export function getAnchoringJobStatus(): AnchoringJobStatus {
  let next_run_in_ms: number | null = null;
  
  if (jobInterval && lastRunTime) {
    const timeSinceLastRun = Date.now() - lastRunTime;
    next_run_in_ms = Math.max(0, config.interval_ms - timeSinceLastRun);
  }

  return {
    enabled: config.enabled,
    running: isRunning,
    interval_ms: config.interval_ms,
    last_run_time: lastRunTime,
    last_run_result: lastRunResult,
    consecutive_failures: consecutiveFailures,
    next_run_in_ms,
  };
}

/**
 * Check if the anchoring job is currently running.
 */
export function isAnchoringJobRunning(): boolean {
  return isRunning;
}

/**
 * Manually trigger the anchoring job (for testing or manual intervention).
 */
export async function triggerAnchoringJob(): Promise<AnchoringJobResult> {
  log('info', 'Manually triggering anchoring job');
  return runAnchoringJob();
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Reset job state (for testing).
 */
export function resetAnchoringJobState(): void {
  stopAnchoringJob();
  config = { ...DEFAULT_CONFIG };
  isRunning = false;
  consecutiveFailures = 0;
  lastRunTime = null;
  lastRunResult = null;
}

/**
 * Get detailed statistics about the anchoring job and epochs.
 */
export function getAnchoringJobStats(): {
  job_status: AnchoringJobStatus;
  epoch_stats: ReturnType<typeof getEpochStats>;
  ready_epochs: number;
} {
  return {
    job_status: getAnchoringJobStatus(),
    epoch_stats: getEpochStats(),
    ready_epochs: getEpochsReadyForFinalization().length,
  };
}
