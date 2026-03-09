# EscrowStatus

## Example Usage

```typescript
import { EscrowStatus } from "@lucid/sdk/models";

let value: EscrowStatus = "Disputed";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"Created" | "Released" | "Refunded" | "Disputed" | Unrecognized<string>
```