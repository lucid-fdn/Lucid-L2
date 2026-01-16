from enum import Enum

class PassportStatus(str, Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    REVOKED = "revoked"

    def __str__(self) -> str:
        return str(self.value)
