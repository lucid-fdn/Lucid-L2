# GetPaymentConfigResponse

Payment configuration

## Example Usage

```typescript
import { GetPaymentConfigResponse } from "@lucid/sdk/models/operations";

let value: GetPaymentConfigResponse = {
  success: true,
  config: {
    "key": "<value>",
    "key1": "<value>",
  },
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `success`             | *boolean*             | :heavy_check_mark:    | N/A                   |
| `config`              | Record<string, *any*> | :heavy_check_mark:    | N/A                   |