# GetAssetPricingResponse

Pricing data (null if not configured)

## Example Usage

```typescript
import { GetAssetPricingResponse } from "@lucid/sdk/models/operations";

let value: GetAssetPricingResponse = {
  success: true,
};
```

## Fields

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `success`                                           | *boolean*                                           | :heavy_check_mark:                                  | N/A                                                 |
| `pricing`                                           | [models.AssetPricing](../../models/assetpricing.md) | :heavy_minus_sign:                                  | N/A                                                 |