// packages/engine/src/compute/control-plane/launch/launch-spec.ts
// Canonical internal model for all 5 agent launch paths.

export type SourceType = 'image' | 'source' | 'catalog' | 'runtime' | 'external';
export type SourceBuildMode = 'dockerfile' | 'nixpacks' | 'prebuilt' | 'external';
export type LaunchTarget = 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';

export interface LaunchSpecMetadata {
  marketplace_slug?: string;
  marketplace_version?: string;
  manifest_hash?: string;
  image_digest?: string;
  publisher?: string;
  trust_tier?: 'official' | 'verified' | 'community';
  source_hash?: string;
}

export interface LaunchSpec {
  source_type: SourceType;
  source_build_mode?: SourceBuildMode;
  source_ref: string;
  resolved_image?: string;
  target: LaunchTarget;
  verification_mode: 'full' | 'minimal';
  env_vars: Record<string, string>;
  port?: number;
  owner: string;
  name: string;
  metadata: LaunchSpecMetadata;
}
