from enum import Enum

class GetV1PassportsTagMatch(str, Enum):
    ALL = "all"
    ANY = "any"

    def __str__(self) -> str:
        return str(self.value)
