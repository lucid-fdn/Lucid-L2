from enum import Enum

class GetV1PassportsSortBy(str, Enum):
    CREATED_AT = "created_at"
    NAME = "name"
    UPDATED_AT = "updated_at"

    def __str__(self) -> str:
        return str(self.value)
