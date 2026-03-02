# ValidateFlowspecResponse

OK

## Example Usage

```typescript
import { ValidateFlowspecResponse } from "@lucid/sdk/models/operations";

let value: ValidateFlowspecResponse = {
  success: false,
  validation: {
    "key": "<value>",
    "key1": "<value>",
  },
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `success`             | *boolean*             | :heavy_check_mark:    | N/A                   |
| `validation`          | Record<string, *any*> | :heavy_check_mark:    | N/A                   |
| `message`             | *string*              | :heavy_minus_sign:    | N/A                   |