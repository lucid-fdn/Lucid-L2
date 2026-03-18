import fs from 'fs';
import path from 'path';
import {
  Project,
  Node,
  SourceFile,
  InterfaceDeclaration,
  FunctionDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  ParameterDeclaration,
} from 'ts-morph';
import {
  DomainSnapshot,
  InterfaceInfo,
  FunctionInfo,
  TypeInfo,
  DependencyEdge,
  PropertyInfo,
  MethodInfo,
  ParamInfo,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJsDoc(node: Node): string | null {
  const jsDocs = (node as any).getJsDocs?.();
  if (!jsDocs || jsDocs.length === 0) return null;
  const desc = jsDocs[0].getDescription().trim();
  return desc || null;
}

function extractParams(params: ParameterDeclaration[]): ParamInfo[] {
  return params.map((p) => ({
    name: p.getName(),
    type: p.getType().getText(p),
    optional: p.isOptional(),
    defaultValue: p.getInitializer()?.getText() ?? null,
  }));
}

function extractInterface(decl: InterfaceDeclaration, domainPath: string): InterfaceInfo {
  const filePath = relativeToDomain(decl.getSourceFile().getFilePath(), domainPath);

  const properties: PropertyInfo[] = decl.getProperties().map((prop) => ({
    name: prop.getName(),
    type: prop.getType().getText(prop),
    jsDoc: getJsDoc(prop),
    optional: prop.hasQuestionToken(),
  }));

  const methods: MethodInfo[] = decl.getMethods().map((m) => ({
    name: m.getName(),
    params: extractParams(m.getParameters()),
    returnType: m.getReturnType().getText(m),
    jsDoc: getJsDoc(m),
  }));

  const extendsExprs = decl.getExtends().map((e) => e.getText());

  return {
    name: decl.getName(),
    filePath,
    jsDoc: getJsDoc(decl),
    properties,
    methods,
    extends: extendsExprs,
  };
}

function extractFunction(decl: FunctionDeclaration, domainPath: string): FunctionInfo | null {
  const name = decl.getName();
  if (!name) return null;

  return {
    name,
    filePath: relativeToDomain(decl.getSourceFile().getFilePath(), domainPath),
    jsDoc: getJsDoc(decl),
    params: extractParams(decl.getParameters()),
    returnType: decl.getReturnType().getText(decl),
    isAsync: decl.isAsync(),
  };
}

function extractTypeAlias(decl: TypeAliasDeclaration, domainPath: string): TypeInfo {
  return {
    name: decl.getName(),
    filePath: relativeToDomain(decl.getSourceFile().getFilePath(), domainPath),
    jsDoc: getJsDoc(decl),
    kind: 'alias',
    definition: decl.getType().getText(decl),
  };
}

function extractEnum(decl: EnumDeclaration, domainPath: string): TypeInfo {
  return {
    name: decl.getName(),
    filePath: relativeToDomain(decl.getSourceFile().getFilePath(), domainPath),
    jsDoc: getJsDoc(decl),
    kind: 'enum',
    definition: decl.getMembers().map((m) => m.getName()).join(', '),
  };
}

function relativeToDomain(absFilePath: string, domainPath: string): string {
  const normalized = absFilePath.replace(/\\/g, '/');
  const normalizedDomain = domainPath.replace(/\\/g, '/');
  return path.relative(normalizedDomain, normalized).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Dependency edge extraction
// ---------------------------------------------------------------------------

function extractDependencyEdges(
  sourceFiles: SourceFile[],
  domainPath: string,
  domainName: string,
): DependencyEdge[] {
  const normalizedDomain = path.resolve(domainPath).replace(/\\/g, '/');
  const domainParent = path.dirname(normalizedDomain);
  const edgeMap = new Map<string, Set<string>>();

  for (const sf of sourceFiles) {
    for (const importDecl of sf.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      // Only consider relative imports
      if (!moduleSpecifier.startsWith('.')) continue;

      const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();
      if (!resolvedSourceFile) continue;

      const resolvedPath = path.resolve(resolvedSourceFile.getFilePath()).replace(/\\/g, '/');

      // Skip if inside the current domain
      if (resolvedPath.startsWith(normalizedDomain + '/') || resolvedPath === normalizedDomain) {
        continue;
      }

      const relativeToDomainParent = path
        .relative(domainParent, resolvedPath)
        .replace(/\\/g, '/');
      const targetDomain = relativeToDomainParent.split('/')[0];
      if (!targetDomain || targetDomain === '..') continue;

      // Collect imported symbols
      const symbols: string[] = [];
      for (const named of importDecl.getNamedImports()) {
        symbols.push(named.getName());
      }
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        symbols.push(defaultImport.getText());
      }
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        symbols.push('* as ' + namespaceImport.getText());
      }

      if (symbols.length === 0) continue;

      const key = targetDomain;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, new Set());
      }
      const existing = edgeMap.get(key)!;
      for (const s of symbols) existing.add(s);
    }
  }

  const edges: DependencyEdge[] = [];
  for (const [toDomain, symbolSet] of edgeMap) {
    edges.push({
      fromDomain: domainName,
      toDomain,
      importedSymbols: Array.from(symbolSet).sort(),
    });
  }

  return edges.sort((a, b) => a.toDomain.localeCompare(b.toDomain));
}

// ---------------------------------------------------------------------------
// Test file exclusion pattern
// ---------------------------------------------------------------------------

function isTestFile(filePath: string, domainPath: string): boolean {
  // Get the path relative to the domain root so that we don't accidentally
  // exclude everything when the domain itself lives under __tests__/ (fixtures).
  const rel = path.relative(domainPath, filePath).replace(/\\/g, '/');
  if (rel.startsWith('__tests__/') || rel.includes('/__tests__/')) return true;
  if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

export function extractDomainSnapshot(domainPath: string): DomainSnapshot {
  const normalizedDomain = path.resolve(domainPath).replace(/\\/g, '/');
  const domainName = path.basename(normalizedDomain);

  // Try to use the repo's real tsconfig for correct module resolution.
  // Fall back to ad hoc settings (for test fixtures outside the repo structure).
  const repoTsConfig = path.resolve(__dirname, '..', '..', '..', '..', 'offchain', 'tsconfig.base.json');
  let project: Project;

  try {
    // Check if tsconfig exists and the domain is under the repo
    if (fs.existsSync(repoTsConfig)) {
      project = new Project({ tsConfigFilePath: repoTsConfig });
      // Add the domain and sibling files for cross-domain resolution
      const domainParent = path.dirname(normalizedDomain);
      project.addSourceFilesAtPaths(domainParent + '/**/*.ts');
    } else {
      throw new Error('tsconfig not found');
    }
  } catch {
    // Fallback: create project with ad hoc compiler options
    project = new Project({
      compilerOptions: {
        target: 99 /* ESNext */,
        module: 99 /* ESNext */,
        moduleResolution: 2 /* Node */,
        strict: true,
        esModuleInterop: true,
        declaration: true,
        skipLibCheck: true,
      },
    });
    // Add all .ts files in the domain directory and parent (for cross-domain resolution)
    const domainParent = path.dirname(normalizedDomain);
    project.addSourceFilesAtPaths(domainParent + '/**/*.ts');
  }

  // Find all source files in the domain (excluding tests)
  const allDomainFiles = project.getSourceFiles().filter((sf) => {
    const fp = sf.getFilePath().replace(/\\/g, '/');
    return fp.startsWith(normalizedDomain + '/') && !isTestFile(fp, normalizedDomain);
  });

  // Find the barrel file
  const barrelFile = allDomainFiles.find((sf) => {
    const fp = sf.getFilePath().replace(/\\/g, '/');
    return fp === normalizedDomain + '/index.ts';
  });

  const interfaces: InterfaceInfo[] = [];
  const functions: FunctionInfo[] = [];
  const types: TypeInfo[] = [];

  if (barrelFile) {
    // Barrel-based: use getExportedDeclarations() to get only public symbols
    const exportedDecls = barrelFile.getExportedDeclarations();

    for (const [, declarations] of exportedDecls) {
      for (const decl of declarations) {
        if (Node.isInterfaceDeclaration(decl)) {
          interfaces.push(extractInterface(decl, normalizedDomain));
        } else if (Node.isFunctionDeclaration(decl)) {
          const fn = extractFunction(decl, normalizedDomain);
          if (fn) functions.push(fn);
        } else if (Node.isTypeAliasDeclaration(decl)) {
          types.push(extractTypeAlias(decl, normalizedDomain));
        } else if (Node.isEnumDeclaration(decl)) {
          types.push(extractEnum(decl, normalizedDomain));
        }
      }
    }
  } else {
    // Fallback: scan all domain files for exported declarations
    for (const sf of allDomainFiles) {
      const exportedDecls = sf.getExportedDeclarations();
      for (const [, declarations] of exportedDecls) {
        for (const decl of declarations) {
          if (Node.isInterfaceDeclaration(decl)) {
            interfaces.push(extractInterface(decl, normalizedDomain));
          } else if (Node.isFunctionDeclaration(decl)) {
            const fn = extractFunction(decl, normalizedDomain);
            if (fn) functions.push(fn);
          } else if (Node.isTypeAliasDeclaration(decl)) {
            types.push(extractTypeAlias(decl, normalizedDomain));
          } else if (Node.isEnumDeclaration(decl)) {
            types.push(extractEnum(decl, normalizedDomain));
          }
        }
      }
    }
  }

  // Extract dependency edges from ALL domain files (not just barrel)
  const imports = extractDependencyEdges(allDomainFiles, normalizedDomain, domainName);

  // Sort each category by name for deterministic output
  interfaces.sort((a, b) => a.name.localeCompare(b.name));
  functions.sort((a, b) => a.name.localeCompare(b.name));
  types.sort((a, b) => a.name.localeCompare(b.name));

  return {
    domain: domainName,
    sourcePath: normalizedDomain,
    interfaces,
    functions,
    types,
    imports,
    apiHash: '',   // populated later by hash computation
    contentHash: '', // populated later by hash computation
  };
}
