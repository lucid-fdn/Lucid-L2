# AgentPlanRequest

## Example Usage

```typescript
import { AgentPlanRequest } from "@lucid/sdk/models";

let value: AgentPlanRequest = {
  goal: "<value>",
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `goal`                | *string*              | :heavy_check_mark:    | N/A                   |
| `context`             | Record<string, *any*> | :heavy_minus_sign:    | N/A                   |
| `constraints`         | *string*[]            | :heavy_minus_sign:    | N/A                   |
| `autoExecute`         | *boolean*             | :heavy_minus_sign:    | N/A                   |