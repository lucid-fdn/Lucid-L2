import { MemoryACLEngine } from '../acl';

describe('MemoryACLEngine', () => {
  let acl: MemoryACLEngine;

  beforeEach(() => {
    acl = new MemoryACLEngine();
  });

  describe('namespace ownership', () => {
    it('should allow owner to read their own namespace', () => {
      expect(() => acl.assertReadPermission('agent-1', 'agent:agent-1')).not.toThrow();
    });

    it('should allow owner to write their own namespace', () => {
      expect(() => acl.assertWritePermission('agent-1', 'agent:agent-1')).not.toThrow();
    });

    it('should allow owner to read sub-namespace', () => {
      expect(() => acl.assertReadPermission('agent-1', 'agent:agent-1:sub')).not.toThrow();
    });

    it('should deny non-owner read without grant', () => {
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).toThrow('Insufficient permission');
    });

    it('should deny non-owner write without grant', () => {
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).toThrow('Insufficient permission');
    });
  });

  describe('__admin__ bypass', () => {
    it('should allow __admin__ to read any namespace', () => {
      expect(() => acl.assertReadPermission('__admin__', 'agent:agent-1')).not.toThrow();
    });

    it('should allow __admin__ to write any namespace', () => {
      expect(() => acl.assertWritePermission('__admin__', 'agent:agent-1')).not.toThrow();
    });
  });

  describe('grantAccess', () => {
    it('should allow owner to grant read access', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'read');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
    });

    it('should deny write when only read is granted', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'read');
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).toThrow('Insufficient permission');
    });

    it('should allow write when write is granted', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'write');
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).not.toThrow();
    });

    it('should allow read when write is granted', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'write');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
    });

    it('should allow admin grant to read and write', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'admin');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).not.toThrow();
    });

    it('should reject grant from non-owner', async () => {
      await expect(acl.grantAccess('agent-2', 'agent-3', 'agent:agent-1', 'read')).rejects.toThrow('does not own');
    });

    it('should allow __admin__ to grant on any namespace', async () => {
      await acl.grantAccess('__admin__', 'agent-2', 'agent:agent-1', 'read');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
    });
  });

  describe('revokeAccess', () => {
    it('should revoke previously granted access', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'write');
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).not.toThrow();

      await acl.revokeAccess('agent-1', 'agent-2', 'agent:agent-1');
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).toThrow('Insufficient permission');
    });

    it('should reject revoke from non-owner', async () => {
      await expect(acl.revokeAccess('agent-2', 'agent-3', 'agent:agent-1')).rejects.toThrow('does not own');
    });

    it('should allow __admin__ to revoke on any namespace', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'read');
      await acl.revokeAccess('__admin__', 'agent-2', 'agent:agent-1');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).toThrow('Insufficient permission');
    });
  });
});
