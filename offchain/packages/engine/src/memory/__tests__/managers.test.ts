import { validateEpisodic } from '../managers/episodic';
import { validateSemantic } from '../managers/semantic';
import { validateProcedural } from '../managers/procedural';
import { validateEntity } from '../managers/entity';
import { validateTrustWeighted } from '../managers/trustWeighted';
import { validateTemporal } from '../managers/temporal';
import { getManager } from '../managers';

describe('Managers', () => {
  describe('getManager', () => {
    it('should return validators for episodic, semantic, procedural', () => {
      expect(getManager('episodic')).toBe(validateEpisodic);
      expect(getManager('semantic')).toBe(validateSemantic);
      expect(getManager('procedural')).toBe(validateProcedural);
    });

    it('should return validators for entity, trust_weighted, temporal', () => {
      expect(getManager('entity')).toBe(validateEntity);
      expect(getManager('trust_weighted')).toBe(validateTrustWeighted);
      expect(getManager('temporal')).toBe(validateTemporal);
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

  describe('validateEntity', () => {
    const base = {
      agent_passport_id: 'a', namespace: 'agent:a',
      content: 'Vitalik Buterin', metadata: {},
      entity_name: 'Vitalik Buterin', entity_type: 'person',
      attributes: { role: 'co-founder' }, relationships: [],
    };

    it('should pass for a valid entity entry', () => {
      expect(() => validateEntity(base)).not.toThrow();
    });
    it('should reject empty entity_name', () => {
      expect(() => validateEntity({ ...base, entity_name: '' })).toThrow();
    });
    it('should reject empty entity_type', () => {
      expect(() => validateEntity({ ...base, entity_type: '' })).toThrow();
    });
    it('should require attributes to be an object', () => {
      expect(() => validateEntity({ ...base, attributes: 'bad' })).toThrow();
    });
    it('should require relationships to be an array', () => {
      expect(() => validateEntity({ ...base, relationships: 'bad' })).toThrow();
    });
    it('should validate each relationship', () => {
      expect(() => validateEntity({
        ...base,
        relationships: [{ target_entity_id: '', relation_type: 'knows', confidence: 0.9 }],
      })).toThrow();
    });
    it('should reject relationship confidence out of range', () => {
      expect(() => validateEntity({
        ...base,
        relationships: [{ target_entity_id: 'ent-2', relation_type: 'knows', confidence: 1.5 }],
      })).toThrow();
    });
    it('should accept optional entity_id', () => {
      expect(() => validateEntity({ ...base, entity_id: 'stable-id-1' })).not.toThrow();
    });
    it('should accept optional source_memory_ids', () => {
      expect(() => validateEntity({ ...base, source_memory_ids: ['mem-1'] })).not.toThrow();
    });
  });
});

describe('validateTrustWeighted', () => {
  const base = {
    agent_passport_id: 'a', namespace: 'agent:a',
    content: 'Trust data', metadata: {},
    source_agent_passport_id: 'agent-b',
    trust_score: 0.8, decay_factor: 0.1, weighted_relevance: 0.7,
  };
  it('should pass for valid entry', () => { expect(() => validateTrustWeighted(base)).not.toThrow(); });
  it('should reject missing source_agent_passport_id', () => { expect(() => validateTrustWeighted({ ...base, source_agent_passport_id: '' })).toThrow(); });
  it('should reject trust_score > 1', () => { expect(() => validateTrustWeighted({ ...base, trust_score: 1.1 })).toThrow(); });
  it('should reject decay_factor < 0', () => { expect(() => validateTrustWeighted({ ...base, decay_factor: -0.1 })).toThrow(); });
  it('should reject weighted_relevance > 1', () => { expect(() => validateTrustWeighted({ ...base, weighted_relevance: 1.1 })).toThrow(); });
});

describe('validateTemporal', () => {
  const now = Date.now();
  const base = {
    agent_passport_id: 'a', namespace: 'agent:a',
    content: 'ETH was $4000 on March 1', metadata: {},
    valid_from: now - 86400000, valid_to: null, recorded_at: now,
  };
  it('should pass for valid entry', () => { expect(() => validateTemporal(base)).not.toThrow(); });
  it('should reject missing valid_from', () => { expect(() => validateTemporal({ ...base, valid_from: undefined })).toThrow(); });
  it('should accept null valid_to', () => { expect(() => validateTemporal({ ...base, valid_to: null })).not.toThrow(); });
  it('should reject valid_to <= valid_from', () => { expect(() => validateTemporal({ ...base, valid_to: base.valid_from - 1 })).toThrow(); });
  it('should reject recorded_at < valid_from', () => { expect(() => validateTemporal({ ...base, recorded_at: base.valid_from - 1 })).toThrow(); });
});
