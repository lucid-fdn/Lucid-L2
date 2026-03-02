# GetAgentOrchestratorHistoryResponse

OK

## Example Usage

```typescript
import { GetAgentOrchestratorHistoryResponse } from "@lucid/sdk/models/operations";

let value: GetAgentOrchestratorHistoryResponse = {
  success: false,
  tenantId: "<id>",
  history: [
    {
      "key": "<value>",
      "key1": "<value>",
    },
  ],
};
```

## Fields

| Field                   | Type                    | Required                | Description             |
| ----------------------- | ----------------------- | ----------------------- | ----------------------- |
| `success`               | *boolean*               | :heavy_check_mark:      | N/A                     |
| `tenantId`              | *string*                | :heavy_check_mark:      | N/A                     |
| `history`               | Record<string, *any*>[] | :heavy_check_mark:      | N/A                     |
| `stats`                 | Record<string, *any*>   | :heavy_minus_sign:      | N/A                     |
| `message`               | *string*                | :heavy_minus_sign:      | N/A                     |