# WithdrawAssetRevenueResponse

Withdrawal queued

## Example Usage

```typescript
import { WithdrawAssetRevenueResponse } from "@lucid/sdk/models/operations";

let value: WithdrawAssetRevenueResponse = {
  success: true,
  withdrawal: {
    amount: "397.18",
    token: "<value>",
    status: "no_funds",
  },
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `success`                                                      | *boolean*                                                      | :heavy_check_mark:                                             | N/A                                                            |
| `withdrawal`                                                   | [operations.Withdrawal](../../models/operations/withdrawal.md) | :heavy_check_mark:                                             | N/A                                                            |