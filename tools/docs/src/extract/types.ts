export interface DomainSnapshot {
  domain: string;
  sourcePath: string;
  interfaces: InterfaceInfo[];
  functions: FunctionInfo[];
  types: TypeInfo[];
  imports: DependencyEdge[];
  apiHash: string;
  contentHash: string;
}

export interface InterfaceInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  properties: PropertyInfo[];
  methods: MethodInfo[];
  extends: string[];
}

export interface FunctionInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  params: ParamInfo[];
  returnType: string;
  isAsync: boolean;
}

export interface TypeInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  kind: 'alias' | 'enum';
  definition: string;
}

export interface DependencyEdge {
  fromDomain: string;
  toDomain: string;
  importedSymbols: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  jsDoc: string | null;
  optional: boolean;
}

export interface MethodInfo {
  name: string;
  params: ParamInfo[];
  returnType: string;
  jsDoc: string | null;
}

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
}

export interface HashPair {
  apiHash: string;
  contentHash: string;
}

export interface CacheData {
  [domain: string]: HashPair;
}
