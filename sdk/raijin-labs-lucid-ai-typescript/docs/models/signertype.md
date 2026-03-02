# SignerType

## Example Usage

```typescript
import { SignerType } from "@lucid/sdk/models";

let value: SignerType = "orchestrator";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"orchestrator" | "compute" | "worker" | Unrecognized<string>
```