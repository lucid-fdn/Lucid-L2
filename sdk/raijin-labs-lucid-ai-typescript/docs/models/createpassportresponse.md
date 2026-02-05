# CreatePassportResponse

## Example Usage

```typescript
import { CreatePassportResponse } from "raijin-labs-lucid-ai/models";

let value: CreatePassportResponse = {
  success: true,
  passportId: "<id>",
  passport: {
    passportId: "<id>",
    type: "model",
    owner: "<value>",
    status: "revoked",
    metadata: {},
    metadataHash: "<value>",
    createdAt: 596104,
    updatedAt: 17184,
  },
};
```

## Fields

| Field                                    | Type                                     | Required                                 | Description                              |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `success`                                | *boolean*                                | :heavy_check_mark:                       | N/A                                      |
| `passportId`                             | *string*                                 | :heavy_check_mark:                       | N/A                                      |
| `passport`                               | [models.Passport](../models/passport.md) | :heavy_check_mark:                       | N/A                                      |