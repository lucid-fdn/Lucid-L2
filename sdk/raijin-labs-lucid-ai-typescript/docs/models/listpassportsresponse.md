# ListPassportsResponse

## Example Usage

```typescript
import { ListPassportsResponse } from "raijin-labs-lucid-ai/models";

let value: ListPassportsResponse = {
  success: false,
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
  pagination: {
    total: 415655,
    page: 864769,
    perPage: 731028,
    totalPages: 233408,
  },
};
```

## Fields

| Field                                        | Type                                         | Required                                     | Description                                  |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `success`                                    | *boolean*                                    | :heavy_check_mark:                           | N/A                                          |
| `passports`                                  | [models.Passport](../models/passport.md)[]   | :heavy_check_mark:                           | N/A                                          |
| `pagination`                                 | [models.Pagination](../models/pagination.md) | :heavy_check_mark:                           | N/A                                          |