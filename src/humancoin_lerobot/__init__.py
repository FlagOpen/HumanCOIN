"""humancoin_lerobot — multi-frequency extension for LeRobot datasets."""

from .utils import CODEBASE_VERSION
__version__ = "0.1.1"

__all__ = [
    "HumancoinLeRobotDataset",
    "HumancoinDatasetMetadata",
    "AudioFeature",
    "CODEBASE_VERSION",
    "__version__",
]


def __getattr__(name):
    """Keep the download CLI usable without importing torch or LeRobot first."""
    from importlib import import_module

    modules = {
        "HumancoinLeRobotDataset": ".dataset",
        "HumancoinDatasetMetadata": ".metadata",
        "AudioFeature": ".audio",
    }
    if name not in modules:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(modules[name], __name__), name)
    globals()[name] = value
    return value
