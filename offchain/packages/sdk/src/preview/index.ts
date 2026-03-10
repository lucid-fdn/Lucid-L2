// Preview features — not covered by semver stability guarantees.
// These APIs may change without notice between minor versions.

let warned = false;

function warnOnce(): void {
  if (!warned) {
    console.warn('[lucid] Warning: preview features are not covered by semver stability guarantees.');
    warned = true;
  }
}

export function getReputation(): any {
  warnOnce();
  // Lazy-load reputation module from engine
  try {
    return require('@lucid-l2/engine/reputation');
  } catch {
    return {};
  }
}

export function getIdentity(): any {
  warnOnce();
  try {
    return require('@lucid-l2/engine/identity');
  } catch {
    return {};
  }
}

export function getZkml(): any {
  warnOnce();
  return {};
}
