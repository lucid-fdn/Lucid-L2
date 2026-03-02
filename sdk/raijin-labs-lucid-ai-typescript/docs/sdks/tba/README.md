# Tba

## Overview

### Available Operations

* [create](#create) - Create TBA for passport NFT
* [get](#get) - Get TBA address

## create

Create TBA for passport NFT

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_create_tba" method="post" path="/v2/tba/create" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.tba.create({
    chainId: "<id>",
    tokenContract: "<value>",
    tokenId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { tbaCreate } from "@lucid/sdk/funcs/tbaCreate.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await tbaCreate(lucidSDK, {
    chainId: "<id>",
    tokenContract: "<value>",
    tokenId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("tbaCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreateTBARequest](../../models/createtbarequest.md)                                                                                                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.GetTBAResponse](../../models/gettbaresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## get

Get TBA address

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_get_tba" method="get" path="/v2/tba/{chainId}/{tokenId}" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.tba.get({
    chainId: "<id>",
    tokenId: "<id>",
    tokenContract: "<value>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { tbaGet } from "@lucid/sdk/funcs/tbaGet.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await tbaGet(lucidSDK, {
    chainId: "<id>",
    tokenId: "<id>",
    tokenContract: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("tbaGet failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.LucidGetTbaRequest](../../models/operations/lucidgettbarequest.md)                                                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.GetTBAResponse](../../models/gettbaresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |