import { validateEpisodic } from '../managers/episodic';
import { validateSemantic } from '../managers/semantic';
import { validateProcedural } from '../managers/procedural';
import { getManager } from '../managers';

describe('Managers', () => {
  describe('getManager', () => {
    it('should return validators for episodic, semantic, procedural', () => {
      expect(getManager('episodic')).toBe(validateEpisodic);
      expect(getManager('semantic')).toBe(validateSemantic);
      expect(getManager('procedural')).toBe(validateProcedural);
    });

    it('should throw for entity, trust_weighted, temporal', () => {
      expect(() => getManager('entity')).toThrow('not yet implemented');
      expect(() => getManager('trust_weighted')).toThrow('not yet implemented');
      expect(() => getManager('temporal')).toThrow('not yet implemented');
    });
  });

  describe('validateEpisodic', () => {
    const base = {
      agent_passport_id: 'a',
      namespace: 'agent:a',
      content: 'Hello',
      metadata: {},
      session_id: 's1',
      role: 'user',
      tokens: 5,
    };

    it('should pass for a valid episodic entry', () => {
      expect(() => validateEpisodic(base)).not.toThrow();
    });

    it('should reject missing agent_passport_id', () => {
      expect(() => validateEpisodic({ ...base, agent_passport_id: '' })).toThrow();
    });

    it('should reject missing namespace', () => {
      expect(() => validateEpisodic({ ...base, namespace: '' })).toThrow();
    });

    it('should reject missing content', () => {
      expect(() => validateEpisodic({ ...base, content: '' })).toThrow();
    });

    it('should reject content over 100KB', () => {
      expect(() => validateEpisodic({ ...base, content: 'x'.repeat(100 * 1024 + 1) })).toThrow();
    });

    it('should reject metadata over 64KB', () => {
      const bigMeta: Record<string, unknown> = {};
      bigMeta.data = 'x'.repeat(64 * 1024 + 1);
      expect(() => validateEpisodic({ ...base, metadata: bigMeta })).toThrow();
    });

    it('should reject metadata with _lucid_ prefixed keys', () => {
      expect(() => validateEpisodic({ ...base, metadata: { _lucid_internal: 'bad' } })).toThrow();
    });

    it('should reject missing session_id', () => {
      expect(() => validateEpisodic({ ...base, session_id: '' })).toThrow();
    });

    it('should reject invalid role', () => {
      expect(() => validateEpisodic({ ...base, role: 'admin' })).toThrow();
    });

    it('should accept all 4 valid roles', () => {
      for (const role of ['user', 'assistant', 'system', 'tool']) {
        expect(() => validateEpisodic({ ...base, role })).not.toThrow();
      }
    });

    it('should reject negative tokens', () => {
      expect(() => validateEpisodic({ ...base, tokens: -1 })).toThrow();
    });

    it('should accept zero tokens', () => {
      expect(() => validateEpisodic({ ...base, tokens: 0 })).not.toThrow();
    });
  });

  describe('validateSemantic', () => {
    const base = {
      agent_passport_id: 'a',
      namespace: 'agent:a',
      content: 'The sky is blue',
      metadata: {},
      fact: 'The sky is blue',
      confidence: 0.9,
      source_memory_ids: [],
    };

    it('should pass for a valid semantic entry', () => {
      expect(() => validateSemantic(base)).not.toThrow();
    });

    it('should reject missing fact', () => {
      expect(() => validateSemantic({ ...base, fact: '' })).toThrow();
    });

    it('should reject confidence below 0', () => {
      expect(() => validateSemantic({ ...base, confidence: -0.1 })).toThrow();
    });

    it('should reject confidence above 1', () => {
      expect(() => validateSemantic({ ...base, confidence: 1.1 })).toThrow();
    });

    it('should accept confidence at boundaries', () => {
      expect(() => validateSemantic({ ...base, confidence: 0 })).not.toThrow();
      expect(() => validateSemantic({ ...base, confidence: 1 })).not.toThrow();
    });

    it('should reject non-array source_memory_ids', () => {
      expect(() => validateSemantic({ ...base, source_memory_ids: 'not-array' })).toThrow();
    });
  });

  describe('validateProcedural', () => {
    const base = {
      agent_passport_id: 'a',
      namespace: 'agent:a',
      content: 'Always greet the user',
      metadata: {},
      rule: 'Always greet',
      trigger: 'start',
      priority: 1,
      source_memory_ids: [],
    };

    it('should pass for a valid procedural entry', () => {
      expect(() => validateProcedural(base)).not.toThrow();
    });

    it('should reject missing rule', () => {
      expect(() => validateProcedural({ ...base, rule: '' })).toThrow();
    });

    it('should reject missing trigger', () => {
      expect(() => validateProcedural({ ...base, trigger: '' })).toThrow();
    });

    it('should reject negative priority', () => {
      expect(() => validateProcedural({ ...base, priority: -1 })).toThrow();
    });

    it('should default priority to 0 when undefined', () => {
      const entry = { ...base, priority: undefined };
      expect(() => validateProcedural(entry)).not.toThrow();
      expect(entry.priority).toBe(0);
    });

    it('should reject non-array source_memory_ids', () => {
      expect(() => validateProcedural({ ...base, source_memory_ids: 'not-array' })).toThrow();
    });
  });
});
