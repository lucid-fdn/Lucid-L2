# ListModulesResponse

## Example Usage

```typescript
import { ListModulesResponse } from "@lucid/sdk/models";

let value: ListModulesResponse = {
  success: true,
};
```

## Fields

| Field                                  | Type                                   | Required                               | Description                            |
| -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `success`                              | *boolean*                              | :heavy_check_mark:                     | N/A                                    |
| `modules`                              | [models.Modules](../models/modules.md) | :heavy_minus_sign:                     | Installed modules by type              |