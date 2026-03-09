# GetSupportedChainsResponse

Supported chains

## Example Usage

```typescript
import { GetSupportedChainsResponse } from "@lucid/sdk/models/operations";

let value: GetSupportedChainsResponse = {
  success: false,
  chains: [
    {},
  ],
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `success`                                              | *boolean*                                              | :heavy_check_mark:                                     | N/A                                                    |
| `chains`                                               | [operations.Chain](../../models/operations/chain.md)[] | :heavy_check_mark:                                     | N/A                                                    |