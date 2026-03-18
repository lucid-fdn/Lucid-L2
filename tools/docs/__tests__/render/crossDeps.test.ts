import { renderCrossDeps } from '../../src/render/crossDeps';
import type { DependencyEdge } from '../../src/extract/types';

function edge(fromDomain: string, toDomain: string, importedSymbols: string[]): DependencyEdge {
  return { fromDomain, toDomain, importedSymbols };
}

describe('renderCrossDeps', () => {
  it('returns no-dependencies message when edges array is empty', () => {
    const result = renderCrossDeps('memory', []);

    expect(result).toBe('## Cross-Domain Dependencies\n\nNo cross-domain dependencies detected.');
  });

  it('returns no-dependencies message when no edges involve the target domain', () => {
    const edges: DependencyEdge[] = [
      edge('payment', 'identity', ['createPassport']),
      edge('compute', 'receipt', ['signReceipt']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toBe('## Cross-Domain Dependencies\n\nNo cross-domain dependencies detected.');
  });

  it('renders import edges for the target domain', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256', 'canonicalJson']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toContain('## Cross-Domain Dependencies');
    expect(result).toContain('| Direction | Domain | Symbols | Purpose |');
    expect(result).toContain('| imports | shared | `sha256`, `canonicalJson` | — |');
  });

  it('renders "exports to" edges for other domains importing from this one', () => {
    const edges: DependencyEdge[] = [
      edge('anchoring', 'shared', ['ArchivePipeline']),
    ];
    const result = renderCrossDeps('shared', edges);

    expect(result).toContain('| exports to | anchoring | `ArchivePipeline` | — |');
  });

  it('renders both import and export rows in the same table', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256']),
      edge('anchoring', 'memory', ['ArchivePipeline']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toContain('| imports | shared | `sha256` | — |');
    expect(result).toContain('| exports to | anchoring | `ArchivePipeline` | — |');
  });

  it('does not include edges from unrelated domains', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256']),
      edge('payment', 'identity', ['createPassport']),
      edge('compute', 'receipt', ['signReceipt']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toContain('| imports | shared | `sha256` | — |');
    expect(result).not.toContain('payment');
    expect(result).not.toContain('compute');
    expect(result).not.toContain('identity');
    expect(result).not.toContain('receipt');
  });

  it('sorts import rows by toDomain alphabetically', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256']),
      edge('memory', 'anchoring', ['AnchorDispatcher']),
      edge('memory', 'identity', ['PassportId']),
    ];
    const result = renderCrossDeps('memory', edges);

    const anchoringIdx = result.indexOf('| imports | anchoring |');
    const identityIdx = result.indexOf('| imports | identity |');
    const sharedIdx = result.indexOf('| imports | shared |');

    expect(anchoringIdx).toBeLessThan(identityIdx);
    expect(identityIdx).toBeLessThan(sharedIdx);
  });

  it('sorts export rows by fromDomain alphabetically', () => {
    const edges: DependencyEdge[] = [
      edge('payment', 'shared', ['PaymentEvent']),
      edge('anchoring', 'shared', ['AnchorRecord']),
      edge('memory', 'shared', ['MemoryEntry']),
    ];
    const result = renderCrossDeps('shared', edges);

    const anchoringIdx = result.indexOf('| exports to | anchoring |');
    const memoryIdx = result.indexOf('| exports to | memory |');
    const paymentIdx = result.indexOf('| exports to | payment |');

    expect(anchoringIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(paymentIdx);
  });

  it('renders multiple symbols as backtick-wrapped comma-separated values', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256', 'canonicalJson', 'hashPair']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toContain('`sha256`, `canonicalJson`, `hashPair`');
  });

  it('renders a single symbol without trailing comma', () => {
    const edges: DependencyEdge[] = [
      edge('memory', 'shared', ['sha256']),
    ];
    const result = renderCrossDeps('memory', edges);

    expect(result).toContain('`sha256`');
    expect(result).not.toContain('`sha256`,');
  });
});
