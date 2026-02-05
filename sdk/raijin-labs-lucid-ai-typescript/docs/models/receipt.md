# Receipt

## Example Usage

```typescript
import { Receipt } from "raijin-labs-lucid-ai/models";

let value: Receipt = {
  runId: "<id>",
  modelPassportId: "<id>",
  computePassportId: "<id>",
  policyHash: "<value>",
  runtime: "<value>",
  tokensIn: 396846,
  tokensOut: 96137,
  ttftMs: 67093,
  timestamp: 269858,
  receiptHash: "<value>",
  signature: "<value>",
};
```

## Fields

| Field                                | Type                                 | Required                             | Description                          |
| ------------------------------------ | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| `runId`                              | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `modelPassportId`                    | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `computePassportId`                  | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `policyHash`                         | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `runtime`                            | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `tokensIn`                           | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `tokensOut`                          | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `ttftMs`                             | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `totalLatencyMs`                     | *number*                             | :heavy_minus_sign:                   | N/A                                  |
| `timestamp`                          | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `receiptHash`                        | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `signature`                          | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `merkleLeafIndex`                    | *number*                             | :heavy_minus_sign:                   | N/A                                  |
| `anchor`                             | [models.Anchor](../models/anchor.md) | :heavy_minus_sign:                   | N/A                                  |