import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../offchain/openapi.yaml',
  output: {
    path: 'src/generated',
    // We already have our own wrapper client/modules; generated code is a low-level typed client.
    // Keeping it separate makes it easy to migrate incrementally.
  },
});

