# LucidListPassportsPendingSyncResponse

OK

## Example Usage

```typescript
import { LucidListPassportsPendingSyncResponse } from "raijin-labs-lucid-ai/models/operations";

let value: LucidListPassportsPendingSyncResponse = {
  success: false,
  count: 883733,
  passports: [
    {
      passportId: "<id>",
      type: "compute",
      owner: "<value>",
      status: "deprecated",
      metadata: {
        "key": "<value>",
        "key1": "<value>",
        "key2": "<value>",
      },
      metadataHash: "<value>",
      createdAt: 942792,
      updatedAt: 140064,
    },
  ],
};
```

## Fields

| Field                                         | Type                                          | Required                                      | Description                                   |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `success`                                     | *boolean*                                     | :heavy_check_mark:                            | N/A                                           |
| `count`                                       | *number*                                      | :heavy_check_mark:                            | N/A                                           |
| `passports`                                   | [models.Passport](../../models/passport.md)[] | :heavy_check_mark:                            | N/A                                           |