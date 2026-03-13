import { validateExtractionResponse } from '../extraction';

describe('validateExtractionResponse', () => {
  it('should pass valid extraction output', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [{ fact: 'sky is blue', confidence: 0.9 }],
      rules: [{ rule: 'greet first', trigger: 'start', priority: 1 }],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.rules).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('should assume schema_version 1.0 when missing', () => {
    const result = validateExtractionResponse({
      facts: [{ fact: 'test', confidence: 0.5 }],
      rules: [],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('schema_version'))).toBe(true);
  });

  it('should reject unsupported schema_version', () => {
    const result = validateExtractionResponse({
      schema_version: '2.0',
      facts: [{ fact: 'test', confidence: 0.5 }],
      rules: [],
    });
    expect(result.facts).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings.some(w => w.toLowerCase().includes('unsupported'))).toBe(true);
  });

  it('should drop malformed facts with warning', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [
        { fact: 'valid', confidence: 0.8 },
        { fact: '', confidence: 0.5 },       // empty fact
        { fact: 'no-conf' },                  // missing confidence
      ],
      rules: [],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should cap output at max facts/rules', () => {
    const facts = Array.from({ length: 25 }, (_, i) => ({ fact: `fact-${i}`, confidence: 0.5 }));
    const result = validateExtractionResponse({
      schema_version: '1.0', facts, rules: [],
    }, 5, 5);
    expect(result.facts).toHaveLength(5);
    expect(result.warnings.some(w => w.includes('capped'))).toBe(true);
  });

  it('should return empty for non-object input', () => {
    const result = validateExtractionResponse('not an object');
    expect(result.facts).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
  });

  it('should return empty for null input', () => {
    const result = validateExtractionResponse(null);
    expect(result.facts).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('not an object'))).toBe(true);
  });

  it('should drop rules with missing trigger', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [],
      rules: [
        { rule: 'valid rule', trigger: 'start', priority: 1 },
        { rule: 'no trigger rule' },
      ],
    });
    expect(result.rules).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('missing trigger'))).toBe(true);
  });

  it('should default rule priority to 0 when missing', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [],
      rules: [{ rule: 'some rule', trigger: 'always' }],
    });
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].priority).toBe(0);
  });

  it('should reject facts with confidence out of range', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [
        { fact: 'too high', confidence: 1.5 },
        { fact: 'negative', confidence: -0.1 },
        { fact: 'valid', confidence: 0.0 },
      ],
      rules: [],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].fact).toBe('valid');
    expect(result.warnings).toHaveLength(2);
  });
});
