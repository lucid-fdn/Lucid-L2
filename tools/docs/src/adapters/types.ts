export interface PageSource {
  pagePath: string;          // target path in lucid-docs, e.g. "deploy/from-telegram"
  title: string;
  description: string;
  rawContent: string;        // extracted markdown content
  sourceFile: string;        // absolute path, for cache invalidation
  sourceSection?: string;    // heading within source file
  needsEnrichment: boolean;  // false = use rawContent as-is
}

export interface SourceAdapter {
  name: string;
  extract(): Promise<PageSource[]>;
}
