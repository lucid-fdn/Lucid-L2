# GetAssetRevenueResponse

Revenue summary

## Example Usage

```typescript
import { GetAssetRevenueResponse } from "@lucid/sdk/models/operations";

let value: GetAssetRevenueResponse = {
  success: true,
  revenue: {
    total: "<value>",
    pending: "<value>",
    withdrawn: "<value>",
    token: "<value>",
  },
};
```

## Fields

| Field                                             | Type                                              | Required                                          | Description                                       |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `success`                                         | *boolean*                                         | :heavy_check_mark:                                | N/A                                               |
| `revenue`                                         | [models.RevenueInfo](../../models/revenueinfo.md) | :heavy_check_mark:                                | N/A                                               |