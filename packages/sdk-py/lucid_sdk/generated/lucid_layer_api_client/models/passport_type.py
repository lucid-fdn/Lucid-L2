from enum import Enum

class PassportType(str, Enum):
    AGENT = "agent"
    COMPUTE = "compute"
    DATASET = "dataset"
    MODEL = "model"
    TOOL = "tool"

    def __str__(self) -> str:
        return str(self.value)
