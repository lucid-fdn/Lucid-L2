# LucidRetryEpochResponse

OK

## Example Usage

```typescript
import { LucidRetryEpochResponse } from "@lucid/sdk/models/operations";

let value: LucidRetryEpochResponse = {
  success: true,
  epoch: {
    epochId: "<id>",
    status: "<value>",
  },
};
```

## Fields

| Field                                                | Type                                                 | Required                                             | Description                                          |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `success`                                            | *boolean*                                            | :heavy_check_mark:                                   | N/A                                                  |
| `epoch`                                              | [operations.Epoch](../../models/operations/epoch.md) | :heavy_check_mark:                                   | N/A                                                  |