import { canonicalJson } from '../canonicalJson';
import vectors from './canonical-vectors.json';

describe('canonicalJson', () => {
  // Golden vector tests (shared with platform-core)
  describe('golden vectors', () => {
    vectors.forEach((v, i) => {
      it(`vector ${i}: ${JSON.stringify(v.input).slice(0, 40)}`, () => {
        expect(canonicalJson(v.input)).toBe(v.expected);
      });
    });
  });

  // Lucid normalization tests
  it('should handle NaN → null', () => {
    expect(canonicalJson({ x: NaN })).toBe('{"x":null}');
  });

  it('should handle Infinity → null', () => {
    expect(canonicalJson({ x: Infinity })).toBe('{"x":null}');
  });

  it('should handle undefined → stripped', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('should handle Date → ISO string', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(canonicalJson({ d })).toBe('{"d":"2026-01-01T00:00:00.000Z"}');
  });

  it('should throw on circular reference', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(() => canonicalJson(obj)).toThrow('Circular reference');
  });
});
