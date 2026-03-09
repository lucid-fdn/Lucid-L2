# SubscribeRequest

## Example Usage

```typescript
import { SubscribeRequest } from "@lucid/sdk/models/operations";

let value: SubscribeRequest = {
  xPaymentProof: "<value>",
  body: {
    passportId: "<id>",
  },
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `xPaymentProof`                                                                    | *string*                                                                           | :heavy_check_mark:                                                                 | Transaction hash proving USDC payment (x402 protocol)                              |
| `body`                                                                             | [operations.SubscribeRequestBody](../../models/operations/subscriberequestbody.md) | :heavy_check_mark:                                                                 | N/A                                                                                |