# PaymasterRateResponse

## Example Usage

```typescript
import { PaymasterRateResponse } from "@lucid/sdk/models";

let value: PaymasterRateResponse = {
  success: false,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `success`          | *boolean*          | :heavy_check_mark: | N/A                |
| `exchangeRate`     | *number*           | :heavy_minus_sign: | LUCID per ETH rate |
| `chainId`          | *string*           | :heavy_minus_sign: | N/A                |