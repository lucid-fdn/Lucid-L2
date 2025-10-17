// Type definitions for Lucid Passports program
import { Idl } from '@coral-xyz/anchor';

export type LucidPassports = Idl & {
  version: '0.1.0';
  name: 'lucid_passports';
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
  };
  instructions: Array<{
    name: string;
    accounts: any[];
    args: any[];
  }>;
  accounts: Array<{
    name: string;
    type: {
      kind: string;
      fields: any[];
    };
  }>;
  types: Array<{
    name: string;
    type: {
      kind: string;
      variants?: any[];
      fields?: any[];
    };
  }>;
  errors?: any[];
};

// Default IDL for development - will be replaced with actual deployed program IDL
export const LUCID_PASSPORTS_IDL: LucidPassports = {
  version: '0.1.0',
  name: 'lucid_passports',
  address: '11111111111111111111111111111111', // Placeholder
  metadata: {
    name: 'lucid_passports',
    version: '0.1.0',
    spec: '0.1.0',
  },
  instructions: [],
  accounts: [
    {
      name: 'passport',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
      type: {
        kind: 'struct',
        fields: [],
      },
    },
  ],
  types: [],
};
