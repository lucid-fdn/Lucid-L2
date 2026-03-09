# Payments

## Overview

### Available Operations

* [getAssetPricing](#getassetpricing) - Get asset pricing
* [setAssetPricing](#setassetpricing) - Set asset pricing
* [deleteAssetPricing](#deleteassetpricing) - Remove asset pricing
* [getAssetRevenue](#getassetrevenue) - Get asset revenue summary
* [withdrawAssetRevenue](#withdrawassetrevenue) - Withdraw asset revenue
* [getPaymentConfig](#getpaymentconfig) - Get x402 payment configuration
* [setDefaultFacilitator](#setdefaultfacilitator) - Set default payment facilitator
* [getSupportedChains](#getsupportedchains) - List supported payment chains
* [subscribe](#subscribe) - Subscribe to asset access

## getAssetPricing

Get asset pricing

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getAssetPricing" method="get" path="/v1/assets/{passport_id}/pricing" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.payments.getAssetPricing({
    passportId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsGetAssetPricing } from "@lucid/sdk/funcs/paymentsGetAssetPricing.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymentsGetAssetPricing(lucidSDK, {
    passportId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsGetAssetPricing failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetAssetPricingRequest](../../models/operations/getassetpricingrequest.md)                                                                                         | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetAssetPricingResponse](../../models/operations/getassetpricingresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## setAssetPricing

Admin-only. Sets or updates the pricing configuration for an AI asset.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="setAssetPricing" method="put" path="/v1/assets/{passport_id}/pricing" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await lucidSDK.payments.setAssetPricing({
    passportId: "<id>",
    body: {
      payoutAddress: "<value>",
    },
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsSetAssetPricing } from "@lucid/sdk/funcs/paymentsSetAssetPricing.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await paymentsSetAssetPricing(lucidSDK, {
    passportId: "<id>",
    body: {
      payoutAddress: "<value>",
    },
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsSetAssetPricing failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.SetAssetPricingRequest](../../models/operations/setassetpricingrequest.md)                                                                                         | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.SuccessResponse](../../models/successresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400, 401                 | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## deleteAssetPricing

Admin-only. Removes pricing (asset becomes free access).

### Example Usage

<!-- UsageSnippet language="typescript" operationID="deleteAssetPricing" method="delete" path="/v1/assets/{passport_id}/pricing" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await lucidSDK.payments.deleteAssetPricing({
    passportId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsDeleteAssetPricing } from "@lucid/sdk/funcs/paymentsDeleteAssetPricing.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await paymentsDeleteAssetPricing(lucidSDK, {
    passportId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsDeleteAssetPricing failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.DeleteAssetPricingRequest](../../models/operations/deleteassetpricingrequest.md)                                                                                   | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.DeleteAssetPricingResponse](../../models/operations/deleteassetpricingresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 401                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## getAssetRevenue

Get asset revenue summary

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getAssetRevenue" method="get" path="/v1/assets/{passport_id}/revenue" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.payments.getAssetRevenue({
    passportId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsGetAssetRevenue } from "@lucid/sdk/funcs/paymentsGetAssetRevenue.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymentsGetAssetRevenue(lucidSDK, {
    passportId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsGetAssetRevenue failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetAssetRevenueRequest](../../models/operations/getassetrevenuerequest.md)                                                                                         | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetAssetRevenueResponse](../../models/operations/getassetrevenueresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## withdrawAssetRevenue

Admin-only. Marks confirmed revenue as pending_payout. The actual
on-chain transfer happens via the batch payout epoch.


### Example Usage

<!-- UsageSnippet language="typescript" operationID="withdrawAssetRevenue" method="post" path="/v1/assets/{passport_id}/withdraw" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await lucidSDK.payments.withdrawAssetRevenue({
    passportId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsWithdrawAssetRevenue } from "@lucid/sdk/funcs/paymentsWithdrawAssetRevenue.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await paymentsWithdrawAssetRevenue(lucidSDK, {
    passportId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsWithdrawAssetRevenue failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.WithdrawAssetRevenueRequest](../../models/operations/withdrawassetrevenuerequest.md)                                                                               | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.WithdrawAssetRevenueResponse](../../models/operations/withdrawassetrevenueresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 401                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## getPaymentConfig

Get x402 payment configuration

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getPaymentConfig" method="get" path="/v1/config/payment" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.payments.getPaymentConfig();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsGetPaymentConfig } from "@lucid/sdk/funcs/paymentsGetPaymentConfig.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymentsGetPaymentConfig(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsGetPaymentConfig failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetPaymentConfigResponse](../../models/operations/getpaymentconfigresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## setDefaultFacilitator

Admin-only. Sets the default x402 facilitator (direct, coinbase, payai).

### Example Usage

<!-- UsageSnippet language="typescript" operationID="setDefaultFacilitator" method="put" path="/v1/config/facilitator" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await lucidSDK.payments.setDefaultFacilitator({
    facilitator: "payai",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsSetDefaultFacilitator } from "@lucid/sdk/funcs/paymentsSetDefaultFacilitator.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await paymentsSetDefaultFacilitator(lucidSDK, {
    facilitator: "payai",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsSetDefaultFacilitator failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.SetDefaultFacilitatorRequest](../../models/operations/setdefaultfacilitatorrequest.md)                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.SuccessResponse](../../models/successresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400, 401                 | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## getSupportedChains

List supported payment chains

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getSupportedChains" method="get" path="/v1/config/chains" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.payments.getSupportedChains();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsGetSupportedChains } from "@lucid/sdk/funcs/paymentsGetSupportedChains.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymentsGetSupportedChains(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsGetSupportedChains failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetSupportedChainsResponse](../../models/operations/getsupportedchainsresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## subscribe

x402-gated. Pay via USDC and receive a time-limited access subscription.
On success, creates an on-chain AccessReceipt.


### Example Usage

<!-- UsageSnippet language="typescript" operationID="subscribe" method="post" path="/v1/access/subscribe" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.payments.subscribe({
    xPaymentProof: "<value>",
    body: {
      passportId: "<id>",
    },
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymentsSubscribe } from "@lucid/sdk/funcs/paymentsSubscribe.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymentsSubscribe(lucidSDK, {
    xPaymentProof: "<value>",
    body: {
      passportId: "<id>",
    },
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymentsSubscribe failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.SubscribeRequest](../../models/operations/subscriberequest.md)                                                                                                     | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.SubscribeResponse](../../models/operations/subscriberesponse.md)\>**

### Errors

| Error Type                      | Status Code                     | Content Type                    |
| ------------------------------- | ------------------------------- | ------------------------------- |
| errors.X402PaymentRequiredError | 402                             | application/json                |
| errors.ErrorResponse            | 500                             | application/json                |
| errors.LucidDefaultError        | 4XX, 5XX                        | \*/\*                           |