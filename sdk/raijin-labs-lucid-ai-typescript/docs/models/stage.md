# Stage

## Example Usage

```typescript
import { Stage } from "@lucid/sdk/models";

let value: Stage = "offchain";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"offchain" | "onchain" | Unrecognized<string>
```