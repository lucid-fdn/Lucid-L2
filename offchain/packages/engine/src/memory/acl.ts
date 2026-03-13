import type { PermissionLevel } from './types';

export class MemoryACLEngine {
  private grants = new Map<string, PermissionLevel>();

  assertReadPermission(callerPassportId: string, namespace: string): void {
    if (callerPassportId === '__admin__') return;
    if (this.ownsNamespace(callerPassportId, namespace)) return;
    const grant = this.grants.get(`${callerPassportId}::${namespace}`);
    if (grant === 'read' || grant === 'write' || grant === 'admin') return;
    throw new Error(`Insufficient permission: '${callerPassportId}' cannot read namespace '${namespace}'`);
  }

  assertWritePermission(callerPassportId: string, namespace: string): void {
    if (callerPassportId === '__admin__') return;
    if (this.ownsNamespace(callerPassportId, namespace)) return;
    const grant = this.grants.get(`${callerPassportId}::${namespace}`);
    if (grant === 'write' || grant === 'admin') return;
    throw new Error(`Insufficient permission: '${callerPassportId}' cannot write namespace '${namespace}'`);
  }

  async grantAccess(owner: string, grantee: string, namespace: string, level: PermissionLevel): Promise<void> {
    if (!this.ownsNamespace(owner, namespace) && owner !== '__admin__') {
      throw new Error(`Cannot grant: '${owner}' does not own namespace '${namespace}'`);
    }
    this.grants.set(`${grantee}::${namespace}`, level);
  }

  async revokeAccess(owner: string, grantee: string, namespace: string): Promise<void> {
    if (!this.ownsNamespace(owner, namespace) && owner !== '__admin__') {
      throw new Error(`Cannot revoke: '${owner}' does not own namespace '${namespace}'`);
    }
    this.grants.delete(`${grantee}::${namespace}`);
  }

  private ownsNamespace(passportId: string, namespace: string): boolean {
    return namespace.startsWith(`agent:${passportId}`);
  }
}
