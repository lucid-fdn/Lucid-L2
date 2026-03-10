import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    passports: 'src/passports.ts',
    receipts: 'src/receipts.ts',
    epochs: 'src/epochs.ts',
    agents: 'src/agents.ts',
    payments: 'src/payments.ts',
    deploy: 'src/deploy.ts',
    crypto: 'src/crypto.ts',
    chains: 'src/chains.ts',
    errors: 'src/errors.ts',
    types: 'src/types.ts',
    'preview/index': 'src/preview/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
