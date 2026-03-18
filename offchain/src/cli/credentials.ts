// src/cli/credentials.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

const LUCID_DIR = process.env.LUCID_CONFIG_DIR || path.join(os.homedir(), '.lucid');
const CREDS_FILE = process.env.LUCID_CREDENTIALS_FILE || path.join(LUCID_DIR, 'credentials.json');

export interface LucidAuth {
  api_url: string;
  token: string;
  expires_at?: string;
}

export interface ProviderCredential {
  token?: string;
  key?: string;
  method: 'oauth' | 'manual';
  connected_at: string;
}

export interface RegistryConfig {
  url: string;
  username?: string;
  token?: string;
}

export interface Credentials {
  lucid?: LucidAuth;
  providers?: Record<string, ProviderCredential>;
  registry?: RegistryConfig;
}

export function loadCredentials(): Credentials {
  try {
    if (!fs.existsSync(CREDS_FILE)) return {};
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(LUCID_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function setLucidAuth(auth: LucidAuth): void {
  const creds = loadCredentials();
  creds.lucid = auth;
  saveCredentials(creds);
}

export function setProvider(name: string, credential: ProviderCredential): void {
  const creds = loadCredentials();
  if (!creds.providers) creds.providers = {};
  creds.providers[name] = credential;
  saveCredentials(creds);
}

export function removeProvider(name: string): boolean {
  const creds = loadCredentials();
  if (!creds.providers?.[name]) return false;
  delete creds.providers[name];
  saveCredentials(creds);
  return true;
}

export function getProviders(): Record<string, ProviderCredential> {
  return loadCredentials().providers || {};
}

export function getLucidAuth(): LucidAuth | undefined {
  return loadCredentials().lucid;
}

export function setRegistry(config: RegistryConfig): void {
  const creds = loadCredentials();
  creds.registry = config;
  saveCredentials(creds);
}

export function getRegistry(): RegistryConfig | undefined {
  return loadCredentials().registry;
}

export { LUCID_DIR, CREDS_FILE };
