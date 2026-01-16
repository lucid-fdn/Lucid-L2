from enum import Enum

class EpochStatus(str, Enum):
    ANCHORED = "anchored"
    ANCHORING = "anchoring"
    FAILED = "failed"
    OPEN = "open"

    def __str__(self) -> str:
        return str(self.value)
