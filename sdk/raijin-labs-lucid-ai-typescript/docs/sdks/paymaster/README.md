# Paymaster

## Overview

### Available Operations

* [sponsor](#sponsor) - Sponsor a UserOp with $LUCID
* [getRate](#getrate) - Get LUCID/ETH exchange rate
* [estimate](#estimate) - Estimate gas cost in $LUCID

## sponsor

Sponsor a UserOp with $LUCID

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_sponsor_user_op" method="post" path="/v2/paymaster/sponsor" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.paymaster.sponsor({
    chainId: "<id>",
    userOp: {},
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymasterSponsor } from "@lucid/sdk/funcs/paymasterSponsor.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymasterSponsor(lucidSDK, {
    chainId: "<id>",
    userOp: {},
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymasterSponsor failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.SponsorUserOpRequest](../../models/sponsoruseroprequest.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.SuccessResponse](../../models/successresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## getRate

Get LUCID/ETH exchange rate

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_get_paymaster_rate" method="get" path="/v2/paymaster/rate/{chainId}" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.paymaster.getRate({
    chainId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymasterGetRate } from "@lucid/sdk/funcs/paymasterGetRate.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymasterGetRate(lucidSDK, {
    chainId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymasterGetRate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.LucidGetPaymasterRateRequest](../../models/operations/lucidgetpaymasterraterequest.md)                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.PaymasterRateResponse](../../models/paymasterrateresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## estimate

Estimate gas cost in $LUCID

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_estimate_gas_lucid" method="post" path="/v2/paymaster/estimate" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.paymaster.estimate({
    chainId: "<id>",
    userOp: {},
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { paymasterEstimate } from "@lucid/sdk/funcs/paymasterEstimate.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await paymasterEstimate(lucidSDK, {
    chainId: "<id>",
    userOp: {},
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("paymasterEstimate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.EstimateGasRequest](../../models/estimategasrequest.md)                                                                                                                | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.SuccessResponse](../../models/successresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |