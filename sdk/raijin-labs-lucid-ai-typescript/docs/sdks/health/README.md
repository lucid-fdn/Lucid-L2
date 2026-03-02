# Health

## Overview

### Available Operations

* [checkSystemHealth](#checksystemhealth) - Overall system health
* [checkLiveness](#checkliveness) - Liveness probe
* [checkReadiness](#checkreadiness) - Readiness probe
* [checkDatabaseHealth](#checkdatabasehealth) - Database health check
* [checkRedisHealth](#checkredishealth) - Redis health check
* [checkNangoHealth](#checknangohealth) - Nango service health check
* [getDetailedHealth](#getdetailedhealth) - Detailed health with statistics

## checkSystemHealth

Overall system health

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_system_health" method="get" path="/health" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkSystemHealth();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckSystemHealth } from "@lucid/sdk/funcs/healthCheckSystemHealth.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckSystemHealth(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckSystemHealth failed:", res.error);
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

**Promise\<[models.SystemHealth](../../models/systemhealth.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.SystemHealthError | 503                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## checkLiveness

Liveness probe

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_liveness" method="get" path="/health/live" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkLiveness();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckLiveness } from "@lucid/sdk/funcs/healthCheckLiveness.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckLiveness(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckLiveness failed:", res.error);
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

**Promise\<[operations.CheckLivenessResponse](../../models/operations/checklivenessresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |

## checkReadiness

Readiness probe

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_readiness" method="get" path="/health/ready" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkReadiness();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckReadiness } from "@lucid/sdk/funcs/healthCheckReadiness.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckReadiness(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckReadiness failed:", res.error);
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

**Promise\<[operations.CheckReadinessResponse](../../models/operations/checkreadinessresponse.md)\>**

### Errors

| Error Type                     | Status Code                    | Content Type                   |
| ------------------------------ | ------------------------------ | ------------------------------ |
| errors.ServiceUnavailableError | 503                            | application/json               |
| errors.LucidDefaultError       | 4XX, 5XX                       | \*/\*                          |

## checkDatabaseHealth

Database health check

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_database_health" method="get" path="/health/database" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkDatabaseHealth();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckDatabaseHealth } from "@lucid/sdk/funcs/healthCheckDatabaseHealth.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckDatabaseHealth(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckDatabaseHealth failed:", res.error);
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

**Promise\<[models.HealthCheckResult](../../models/healthcheckresult.md)\>**

### Errors

| Error Type                    | Status Code                   | Content Type                  |
| ----------------------------- | ----------------------------- | ----------------------------- |
| errors.HealthCheckResultError | 503                           | application/json              |
| errors.LucidDefaultError      | 4XX, 5XX                      | \*/\*                         |

## checkRedisHealth

Redis health check

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_redis_health" method="get" path="/health/redis" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkRedisHealth();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckRedisHealth } from "@lucid/sdk/funcs/healthCheckRedisHealth.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckRedisHealth(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckRedisHealth failed:", res.error);
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

**Promise\<[models.HealthCheckResult](../../models/healthcheckresult.md)\>**

### Errors

| Error Type                    | Status Code                   | Content Type                  |
| ----------------------------- | ----------------------------- | ----------------------------- |
| errors.HealthCheckResultError | 503                           | application/json              |
| errors.LucidDefaultError      | 4XX, 5XX                      | \*/\*                         |

## checkNangoHealth

Nango service health check

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check_nango_health" method="get" path="/health/nango" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.checkNangoHealth();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthCheckNangoHealth } from "@lucid/sdk/funcs/healthCheckNangoHealth.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthCheckNangoHealth(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthCheckNangoHealth failed:", res.error);
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

**Promise\<[models.HealthCheckResult](../../models/healthcheckresult.md)\>**

### Errors

| Error Type                    | Status Code                   | Content Type                  |
| ----------------------------- | ----------------------------- | ----------------------------- |
| errors.HealthCheckResultError | 503                           | application/json              |
| errors.LucidDefaultError      | 4XX, 5XX                      | \*/\*                         |

## getDetailedHealth

Detailed health with statistics

### Example Usage

<!-- UsageSnippet language="typescript" operationID="get_detailed_health" method="get" path="/health/detailed" -->
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.health.getDetailedHealth();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { LucidSDKCore } from "@lucid/sdk/core.js";
import { healthGetDetailedHealth } from "@lucid/sdk/funcs/healthGetDetailedHealth.js";

// Use `LucidSDKCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const lucidSDK = new LucidSDKCore();

async function run() {
  const res = await healthGetDetailedHealth(lucidSDK);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("healthGetDetailedHealth failed:", res.error);
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

**Promise\<[operations.GetDetailedHealthResponse](../../models/operations/getdetailedhealthresponse.md)\>**

### Errors

| Error Type               | Status Code              | Content Type             |
| ------------------------ | ------------------------ | ------------------------ |
| errors.ErrorResponse     | 500                      | application/json         |
| errors.LucidDefaultError | 4XX, 5XX                 | \*/\*                    |