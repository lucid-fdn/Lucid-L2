# CheckExecutorHealthResponse

OK

## Example Usage

```typescript
import { CheckExecutorHealthResponse } from "@lucid/sdk/models/operations";

let value: CheckExecutorHealthResponse = {
  success: false,
  executors: {},
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `success`                                                    | *boolean*                                                    | :heavy_check_mark:                                           | N/A                                                          |
| `executors`                                                  | [operations.Executors](../../models/operations/executors.md) | :heavy_check_mark:                                           | N/A                                                          |
| `message`                                                    | *string*                                                     | :heavy_minus_sign:                                           | N/A                                                          |