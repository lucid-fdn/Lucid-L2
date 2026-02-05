# Passport

## Example Usage

```typescript
import { Passport } from "raijin-labs-lucid-ai/models";

let value: Passport = {
  passportId: "<id>",
  type: "tool",
  owner: "<value>",
  status: "active",
  metadata: {
    "key": "<value>",
  },
  metadataHash: "<value>",
  createdAt: 207714,
  updatedAt: 688480,
};
```

## Fields

| Field                                                | Type                                                 | Required                                             | Description                                          |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `passportId`                                         | *string*                                             | :heavy_check_mark:                                   | N/A                                                  |
| `type`                                               | [models.PassportType](../models/passporttype.md)     | :heavy_check_mark:                                   | N/A                                                  |
| `owner`                                              | *string*                                             | :heavy_check_mark:                                   | N/A                                                  |
| `name`                                               | *string*                                             | :heavy_minus_sign:                                   | N/A                                                  |
| `description`                                        | *string*                                             | :heavy_minus_sign:                                   | N/A                                                  |
| `version`                                            | *string*                                             | :heavy_minus_sign:                                   | N/A                                                  |
| `tags`                                               | *string*[]                                           | :heavy_minus_sign:                                   | N/A                                                  |
| `status`                                             | [models.PassportStatus](../models/passportstatus.md) | :heavy_check_mark:                                   | N/A                                                  |
| `metadata`                                           | Record<string, *any*>                                | :heavy_check_mark:                                   | N/A                                                  |
| `metadataHash`                                       | *string*                                             | :heavy_check_mark:                                   | N/A                                                  |
| `createdAt`                                          | *number*                                             | :heavy_check_mark:                                   | N/A                                                  |
| `updatedAt`                                          | *number*                                             | :heavy_check_mark:                                   | N/A                                                  |
| `onChain`                                            | [models.OnChain](../models/onchain.md)               | :heavy_minus_sign:                                   | N/A                                                  |