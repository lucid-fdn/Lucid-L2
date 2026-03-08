import type { X402Facilitator } from './interface';

export class FacilitatorRegistry {
  private facilitators = new Map<string, X402Facilitator>();
  private defaultName: string | null = null;

  register(facilitator: X402Facilitator): void {
    this.facilitators.set(facilitator.name, facilitator);
  }

  get(name: string): X402Facilitator | undefined {
    return this.facilitators.get(name);
  }

  setDefault(name: string): void {
    if (!this.facilitators.has(name)) {
      throw new Error(`Facilitator "${name}" not registered`);
    }
    this.defaultName = name;
  }

  getDefault(): X402Facilitator {
    if (this.defaultName && this.facilitators.has(this.defaultName)) {
      return this.facilitators.get(this.defaultName)!;
    }
    const first = this.facilitators.values().next();
    if (first.done) {
      throw new Error('No facilitators registered');
    }
    return first.value;
  }

  list(): X402Facilitator[] {
    return Array.from(this.facilitators.values());
  }
}

export { X402Facilitator } from './interface';
export { DirectFacilitator } from './direct';
export type { DirectFacilitatorConfig } from './direct';
