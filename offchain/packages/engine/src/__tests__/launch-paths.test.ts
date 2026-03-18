/**
 * Launch Paths Tests (12 tests)
 *
 * Tests the new launch path infrastructure:
 *   1.  detectSourceType with Dockerfile -> 'dockerfile'
 *   2.  detectSourceType with package.json -> 'nixpacks'
 *   3.  detectSourceType with requirements.txt -> 'nixpacks'
 *   4.  detectSourceType empty dir -> 'unknown'
 *   5.  checkProviderCompat docker + source + dockerfile -> ok
 *   6.  checkProviderCompat akash + source + no dockerfile -> error
 *   7.  checkProviderCompat railway + source + no dockerfile -> error (nixpacks future)
 *   8.  checkProviderCompat unknown target -> error
 *   9.  Registry set/get roundtrip
 *   10. buildFromSource with missing path -> error
 *   11. LaunchSpec type structure verification
 *   12. toLaunchSpec produces correct structure
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Source detection tests (no mocks needed) ---
import { detectSourceType } from '../compute/control-plane/launch/source-builder';
import { checkProviderCompat } from '../compute/control-plane/launch/provider-compat';
import { buildFromSource } from '../compute/control-plane/launch/source-builder';
import type { LaunchSpec, LaunchSpecMetadata, SourceType, SourceBuildMode, LaunchTarget } from '../compute/control-plane/launch/launch-spec';

describe('Launch Paths', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-launch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------
  // detectSourceType
  // ---------------------------------------------------------------

  describe('detectSourceType', () => {
    it('returns "dockerfile" when Dockerfile exists', () => {
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20\n');
      expect(detectSourceType(tmpDir)).toBe('dockerfile');
    });

    it('returns "nixpacks" when package.json exists (no Dockerfile)', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      expect(detectSourceType(tmpDir)).toBe('nixpacks');
    });

    it('returns "nixpacks" when requirements.txt exists', () => {
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask\n');
      expect(detectSourceType(tmpDir)).toBe('nixpacks');
    });

    it('returns "unknown" for empty directory', () => {
      expect(detectSourceType(tmpDir)).toBe('unknown');
    });

    it('prefers Dockerfile over package.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20\n');
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      expect(detectSourceType(tmpDir)).toBe('dockerfile');
    });
  });

  // ---------------------------------------------------------------
  // checkProviderCompat
  // ---------------------------------------------------------------

  describe('checkProviderCompat', () => {
    it('docker + source + dockerfile -> ok', () => {
      const result = checkProviderCompat('docker', 'source', true);
      expect(result).toEqual({ ok: true });
    });

    it('akash + source + no dockerfile -> error', () => {
      const result = checkProviderCompat('akash', 'source', false);
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error).toContain('Dockerfile');
      }
    });

    it('railway + source + no dockerfile -> error with nixpacks mention', () => {
      const result = checkProviderCompat('railway', 'source', false);
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error).toContain('Nixpacks');
        expect(result.error).toContain('future release');
      }
    });

    it('unknown target -> error', () => {
      const result = checkProviderCompat('unknown-provider', 'image', true);
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error).toContain('Unknown target');
      }
    });

    it('all providers support image type', () => {
      for (const target of ['docker', 'railway', 'akash', 'phala', 'ionet', 'nosana']) {
        const result = checkProviderCompat(target, 'image', false);
        expect(result).toEqual({ ok: true });
      }
    });

    it('all providers support catalog type', () => {
      for (const target of ['docker', 'railway', 'akash', 'phala', 'ionet', 'nosana']) {
        const result = checkProviderCompat(target, 'catalog', false);
        expect(result).toEqual({ ok: true });
      }
    });
  });

  // ---------------------------------------------------------------
  // Registry set/get roundtrip
  // ---------------------------------------------------------------

  describe('registry config', () => {
    let origConfigDir: string | undefined;

    beforeEach(() => {
      origConfigDir = process.env.LUCID_CONFIG_DIR;
      const configDir = path.join(tmpDir, '.lucid');
      process.env.LUCID_CONFIG_DIR = configDir;
      // Need to clear the module cache so credentials.ts re-reads env
      jest.resetModules();
    });

    afterEach(() => {
      if (origConfigDir !== undefined) {
        process.env.LUCID_CONFIG_DIR = origConfigDir;
      } else {
        delete process.env.LUCID_CONFIG_DIR;
      }
      jest.resetModules();
    });

    it('set and get registry roundtrip', () => {
      // Re-import after resetModules so env is picked up
      const { setRegistry, getRegistry } = require('../../../../src/cli/credentials');
      setRegistry({ url: 'ghcr.io/testorg', username: 'testuser', token: 'testtoken' });

      const reg = getRegistry();
      expect(reg).toBeDefined();
      expect(reg!.url).toBe('ghcr.io/testorg');
      expect(reg!.username).toBe('testuser');
      expect(reg!.token).toBe('testtoken');
    });

    it('getRegistry returns undefined when not set', () => {
      const { getRegistry } = require('../../../../src/cli/credentials');
      const reg = getRegistry();
      expect(reg).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // buildFromSource with missing path
  // ---------------------------------------------------------------

  describe('buildFromSource', () => {
    it('returns error for missing path', async () => {
      const result = await buildFromSource({
        sourcePath: path.join(tmpDir, 'nonexistent'),
        passportId: 'test-passport',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for unknown source type', async () => {
      // tmpDir exists but is empty — no Dockerfile/package.json/etc.
      const result = await buildFromSource({
        sourcePath: tmpDir,
        passportId: 'test-passport',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No Dockerfile');
    });
  });

  // ---------------------------------------------------------------
  // LaunchSpec type structure
  // ---------------------------------------------------------------

  describe('LaunchSpec type', () => {
    it('can construct a valid LaunchSpec object', () => {
      const spec: LaunchSpec = {
        source_type: 'image',
        source_build_mode: 'prebuilt',
        source_ref: 'ghcr.io/myorg/agent:latest',
        resolved_image: 'ghcr.io/myorg/agent:latest',
        target: 'docker',
        verification_mode: 'full',
        env_vars: { KEY: 'value' },
        port: 3100,
        owner: '0xabc',
        name: 'test-agent',
        metadata: {
          publisher: 'test',
          trust_tier: 'community',
          source_hash: 'abc123',
        },
      };

      expect(spec.source_type).toBe('image');
      expect(spec.target).toBe('docker');
      expect(spec.verification_mode).toBe('full');
      expect(spec.metadata.trust_tier).toBe('community');
      expect(spec.env_vars).toEqual({ KEY: 'value' });
    });

    it('accepts all source types', () => {
      const types: SourceType[] = ['image', 'source', 'catalog', 'runtime', 'external'];
      expect(types).toHaveLength(5);
    });

    it('accepts all build modes', () => {
      const modes: SourceBuildMode[] = ['dockerfile', 'nixpacks', 'prebuilt', 'external'];
      expect(modes).toHaveLength(4);
    });

    it('accepts all launch targets', () => {
      const targets: LaunchTarget[] = ['docker', 'railway', 'akash', 'phala', 'ionet', 'nosana'];
      expect(targets).toHaveLength(6);
    });
  });
});
