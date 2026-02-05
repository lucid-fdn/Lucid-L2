# LucidCreateReceiptResponse

OK

## Example Usage

```typescript
import { LucidCreateReceiptResponse } from "raijin-labs-lucid-ai/models/operations";

let value: LucidCreateReceiptResponse = {
  success: false,
  receipt: {
    runId: "<id>",
    modelPassportId: "<id>",
    computePassportId: "<id>",
    policyHash: "<value>",
    runtime: "<value>",
    tokensIn: 171739,
    tokensOut: 353552,
    ttftMs: 548725,
    timestamp: 353201,
    receiptHash: "<value>",
    signature: "<value>",
  },
};
```

## Fields

| Field                                     | Type                                      | Required                                  | Description                               |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| `success`                                 | *boolean*                                 | :heavy_check_mark:                        | N/A                                       |
| `receipt`                                 | [models.Receipt](../../models/receipt.md) | :heavy_check_mark:                        | N/A                                       |