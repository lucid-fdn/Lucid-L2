# EstimateGasRequest

## Example Usage

```typescript
import { EstimateGasRequest } from "@lucid/sdk/models";

let value: EstimateGasRequest = {
  chainId: "<id>",
  userOp: {},
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `chainId`                                                                | *string*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `userOp`                                                                 | [models.EstimateGasRequestUserOp](../models/estimategasrequestuserop.md) | :heavy_check_mark:                                                       | ERC-4337 UserOperation struct                                            |