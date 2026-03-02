# LucidLaunchShareTokenRequest

## Example Usage

```typescript
import { LucidLaunchShareTokenRequest } from "@lucid/sdk/models/operations";

let value: LucidLaunchShareTokenRequest = {
  passportId: "<id>",
  body: {
    name: "<value>",
    symbol: "<value>",
    totalSupply: 591957,
  },
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `passportId`                                                    | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `body`                                                          | [models.TokenLaunchRequest](../../models/tokenlaunchrequest.md) | :heavy_check_mark:                                              | N/A                                                             |