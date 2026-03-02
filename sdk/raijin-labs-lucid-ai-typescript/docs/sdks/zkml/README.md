# ZkML

## Overview

### Available Operations

* [prove](#prove) - Generate zkML proof
* [verify](#verify) - Verify zkML proof
* [registerModel](#registermodel) - Register model circuit
* [listModels](#listmodels) - List registered model circuits

## prove

Generate zkML proof

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_generate_zkml_proof" method="post" path="/v2/zkml/prove" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.zkML.prove({
    modelId: "<id>",
    inputHash: "<value>",
    outputHash: "<value>",
    policyHash: "<value>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { zkMLProve } from "@lucid/sdk/funcs/zkMLProve.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await zkMLProve(lucidSDK, {
    modelId: "<id>",
    inputHash: "<value>",
    outputHash: "<value>",
    policyHash: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("zkMLProve failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.GenerateZkMLProofRequest](../../models/generatezkmlproofrequest.md)                                                                                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.LucidGenerateZkmlProofResponse](../../models/operations/lucidgeneratezkmlproofresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## verify

Verify zkML proof

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_verify_zkml_proof" method="post" path="/v2/zkml/verify" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.zkML.verify({
    chainId: "<id>",
    proof: {},
    receiptHash: "<value>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { zkMLVerify } from "@lucid/sdk/funcs/zkMLVerify.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await zkMLVerify(lucidSDK, {
    chainId: "<id>",
    proof: {},
    receiptHash: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("zkMLVerify failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.VerifyZkMLProofRequest](../../models/verifyzkmlproofrequest.md)                                                                                                        | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.ZkMLVerifyResponse](../../models/zkmlverifyresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 400                      | application/json         |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## registerModel

Register model circuit

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_register_zkml_model" method="post" path="/v2/zkml/register-model" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.zkML.registerModel({
    chainId: "<id>",
    modelHash: "<value>",
    verifyingKey: "<value>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { zkMLRegisterModel } from "@lucid/sdk/funcs/zkMLRegisterModel.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await zkMLRegisterModel(lucidSDK, {
    chainId: "<id>",
    modelHash: "<value>",
    verifyingKey: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("zkMLRegisterModel failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.RegisterZkMLModelRequest](../../models/registerzkmlmodelrequest.md)                                                                                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
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

## listModels

List registered model circuits

### Example Usage

<!-- UsageSnippet language="typescript" operationID="lucid_list_zkml_models" method="get" path="/v2/zkml/models/{chainId}" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.zkML.listModels({
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
import { zkMLListModels } from "@lucid/sdk/funcs/zkMLListModels.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await zkMLListModels(lucidSDK, {
    chainId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("zkMLListModels failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.LucidListZkmlModelsRequest](../../models/operations/lucidlistzkmlmodelsrequest.md)                                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.ListZkMLModelsResponse](../../models/listzkmlmodelsresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |