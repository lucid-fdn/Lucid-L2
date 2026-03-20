import { ClaudeMdAdapter } from './claudeMdAdapter';
import { ReadmeAdapter } from './readmeAdapter';
import { EnvAdapter } from './envAdapter';
import type { SourceAdapter, PageSource } from './types';

const adapters: SourceAdapter[] = [
  new ClaudeMdAdapter(),
  new ReadmeAdapter(),
  new EnvAdapter(),
];

export async function extractAllPages(adapterFilter?: string): Promise<PageSource[]> {
  const sources = adapterFilter
    ? adapters.filter(a => a.name === adapterFilter)
    : adapters;
  const results: PageSource[] = [];
  for (const adapter of sources) {
    const pages = await adapter.extract();
    results.push(...pages);
  }
  return results;
}
