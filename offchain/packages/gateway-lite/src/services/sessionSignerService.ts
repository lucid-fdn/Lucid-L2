import { createClient } from '@supabase/supabase-js';
import { ec } from 'elliptic';
import crypto from 'crypto';
import { logger } from '../../../engine/src/shared/lib/logger';

export interface SignerPolicy {
  ttl?: number;
  maxAmount?: string;
  allowedPrograms?: string[];
  allowedContracts?: string[];
  dailyLimit?: string;
  requiresQuorum?: boolean;
}

export class SessionSignerService {
  private supabase;
  private encryptionKey: string;
  
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    this.encryptionKey = process.env.PRIVY_SIGNER_ENCRYPTION_KEY!;
    
    if (!this.encryptionKey || this.encryptionKey.length !== 64) {
      throw new Error('PRIVY_SIGNER_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
  }
  
  /**
   * Create a new session signer for a wallet
   */
  async createSessionSigner(
    walletId: string,
    userId: string,
    policies: SignerPolicy
  ) {
    // Generate new ECDSA key pair for this session
   
    const curve = new ec('p256');
    const keyPair = curve.genKeyPair();
    
    const privateKey = keyPair.getPrivate('hex');
    const publicKey = keyPair.getPublic('hex');
    
    // Encrypt private key
    const encryptedPrivateKey = this.encrypt(privateKey);
    
    // Calculate expiry
    const expiresAt = policies.ttl
      ? new Date(Date.now() + policies.ttl * 1000)
      : null;
    
    // Store in database
    const { data, error } = await this.supabase
      .from('session_signers')
      .insert({
        wallet_id: walletId,
        user_id: userId,
        privy_signer_id: `signer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorization_key_private: encryptedPrivateKey,
        authorization_key_public: publicKey,
        ttl_seconds: policies.ttl,
        max_amount_lamports: policies.maxAmount,
        max_amount_wei: policies.maxAmount,
        allowed_programs: policies.allowedPrograms,
        allowed_contracts: policies.allowedContracts,
        daily_limit_lamports: policies.dailyLimit,
        daily_limit_wei: policies.dailyLimit,
        requires_quorum: policies.requiresQuorum || false,
        expires_at: expiresAt
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      signerId: data.id,
      publicKey,
      expiresAt: data.expires_at
    };
  }
  
  /**
   * Check if a transaction can be signed based on policies
   */
  async canSign(userId: string, walletId: string, transaction: any): Promise<{
    allowed: boolean;
    reason?: string;
    signer?: any;
  }> {
    // Get active signers for this wallet
    const { data: signers, error } = await this.supabase
      .from('session_signers')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    
    if (error || !signers || signers.length === 0) {
      return { allowed: false, reason: 'No active session signer found' };
    }
    
    // Use the first active signer (could implement more sophisticated selection)
    const signer = signers[0];
    
    // Check TTL
    if (signer.expires_at && new Date(signer.expires_at) < new Date()) {
      return { allowed: false, reason: 'Session signer expired' };
    }
    
    // Check amount limit
    if (signer.max_amount_lamports && transaction.amount) {
      if (BigInt(transaction.amount) > BigInt(signer.max_amount_lamports)) {
        return { allowed: false, reason: 'Transaction amount exceeds limit' };
      }
    }
    
    // Check daily limit
    if (signer.daily_limit_lamports) {
      const today = new Date().toISOString().split('T')[0];
      const resetDate = new Date(signer.daily_usage_reset_at).toISOString().split('T')[0];
      
      let dailyUsage = signer.daily_usage_lamports || 0;
      if (today !== resetDate) {
        dailyUsage = 0; // Reset daily usage
      }
      
      if (BigInt(dailyUsage) + BigInt(transaction.amount || 0) > BigInt(signer.daily_limit_lamports)) {
        return { allowed: false, reason: 'Daily limit exceeded' };
      }
    }
    
    // Check program allowlist (Solana)
    if (signer.allowed_programs && signer.allowed_programs.length > 0) {
      if (transaction.programId && !signer.allowed_programs.includes(transaction.programId)) {
        return { allowed: false, reason: 'Program ID not in allowlist' };
      }
    }
    
    // Check contract allowlist (EVM)
    if (signer.allowed_contracts && signer.allowed_contracts.length > 0) {
      if (transaction.to && !signer.allowed_contracts.includes(transaction.to.toLowerCase())) {
        return { allowed: false, reason: 'Contract address not in allowlist' };
      }
    }
    
    return { allowed: true, signer };
  }
  
  /**
   * Get decrypted private key for signing
   */
  async getSignerPrivateKey(userId: string, walletId: string): Promise<string> {
    const { data: signer } = await this.supabase
      .from('session_signers')
      .select('authorization_key_private')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .is('revoked_at', null)
      .single();
    
    if (!signer) {
      throw new Error('No active session signer found');
    }
    
    // Decrypt private key
    return this.decrypt(signer.authorization_key_private);
  }
  
  /**
   * Revoke a session signer
   */
  async revokeSessionSigner(signerId: string, userId: string) {
    const { error } = await this.supabase
      .from('session_signers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', signerId)
      .eq('user_id', userId);
    
    if (error) throw error;
  }
  
  /**
   * Update usage tracking after a transaction
   */
  async updateUsage(signerId: string, amount: string) {
    const { data: signer } = await this.supabase
      .from('session_signers')
      .select('*')
      .eq('id', signerId)
      .single();
    
    if (!signer) return;
    
    const today = new Date().toISOString().split('T')[0];
    const resetDate = new Date(signer.daily_usage_reset_at).toISOString().split('T')[0];
    
    let dailyUsage = signer.daily_usage_lamports || 0;
    if (today !== resetDate) {
      dailyUsage = 0; // Reset
    }
    
    await this.supabase
      .from('session_signers')
      .update({
        usage_count: signer.usage_count + 1,
        last_used_at: new Date().toISOString(),
        daily_usage_lamports: BigInt(dailyUsage) + BigInt(amount || 0),
        daily_usage_reset_at: today !== resetDate ? new Date().toISOString() : signer.daily_usage_reset_at
      })
      .eq('id', signerId);
  }
  
  /**
   * Log transaction in audit log
   */
  async logTransaction(details: {
    signerId: string;
    walletId: string;
    userId: string;
    transactionType: string;
    chainType: string;
    amount?: string;
    programId?: string;
    contractAddress?: string;
    transactionSignature?: string;
    transactionHash?: string;
    status: 'success' | 'denied' | 'error';
    denialReason?: string;
    errorMessage?: string;
    n8nWorkflowId?: string;
    n8nExecutionId?: string;
  }) {
    await this.supabase
      .from('signer_audit_log')
      .insert({
        signer_id: details.signerId,
        wallet_id: details.walletId,
        user_id: details.userId,
        transaction_type: details.transactionType,
        chain_type: details.chainType,
        amount_lamports: details.amount,
        amount_wei: details.amount,
        program_id: details.programId,
        contract_address: details.contractAddress,
        transaction_signature: details.transactionSignature,
        transaction_hash: details.transactionHash,
        status: details.status,
        denial_reason: details.denialReason,
        error_message: details.errorMessage,
        n8n_workflow_id: details.n8nWorkflowId,
        n8n_execution_id: details.n8nExecutionId
      });
  }
  
  /**
   * Rotate session signers periodically
   */
  async rotateExpiringSigners() {
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h before expiry
    
    const { data: expiring } = await this.supabase
      .from('session_signers')
      .select('*')
      .is('revoked_at', null)
      .lt('expires_at', threshold.toISOString());
    
    for (const signer of expiring || []) {
      // Create new signer with same policies
      const newSigner = await this.createSessionSigner(
        signer.wallet_id,
        signer.user_id,
        {
          ttl: signer.ttl_seconds,
          maxAmount: signer.max_amount_lamports,
          allowedPrograms: signer.allowed_programs,
          dailyLimit: signer.daily_limit_lamports,
          requiresQuorum: signer.requires_quorum
        }
      );
      
      // Revoke old signer
      await this.revokeSessionSigner(signer.id, signer.user_id);
      
      logger.info(`Rotated signer ${signer.id} → ${newSigner.signerId}`);
    }
  }
  
  /**
   * Clean up expired/revoked signers
   */
  async cleanupOldSigners() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    await this.supabase
      .from('session_signers')
      .delete()
      .or(`revoked_at.lt.${cutoff.toISOString()},expires_at.lt.${cutoff.toISOString()}`);
  }
  
  // Encryption helpers
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
