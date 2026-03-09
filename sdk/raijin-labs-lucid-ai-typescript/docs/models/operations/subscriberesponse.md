# SubscribeResponse

Subscription created

## Example Usage

```typescript
import { SubscribeResponse } from "@lucid/sdk/models/operations";

let value: SubscribeResponse = {
  subscribed: true,
  passportId: "<id>",
  expiresAt: 495053,
  durationHours: 358766,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `subscribed`       | *boolean*          | :heavy_check_mark: | N/A                |
| `passportId`       | *string*           | :heavy_check_mark: | N/A                |
| `expiresAt`        | *number*           | :heavy_check_mark: | Unix timestamp     |
| `durationHours`    | *number*           | :heavy_check_mark: | N/A                |