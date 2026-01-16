from enum import Enum

class ComputeHeartbeatStatus(str, Enum):
    DEGRADED = "degraded"
    DOWN = "down"
    HEALTHY = "healthy"

    def __str__(self) -> str:
        return str(self.value)
