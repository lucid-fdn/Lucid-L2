# Withdrawal

## Example Usage

```typescript
import { Withdrawal } from "@lucid/sdk/models/operations";

let value: Withdrawal = {
  amount: "97.01",
  token: "<value>",
  status: "pending_payout",
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `amount`                                                                                       | *string*                                                                                       | :heavy_check_mark:                                                                             | Amount in micro-units                                                                          |
| `token`                                                                                        | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `status`                                                                                       | [operations.WithdrawAssetRevenueStatus](../../models/operations/withdrawassetrevenuestatus.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |