"""Lightweight command entry points; help loads without importing plotting libraries."""
import argparse
from pathlib import Path


def _run(module, args):
    from importlib import import_module

    try:
        implementation = import_module(f"humancoin.visualization.{module}")
    except ModuleNotFoundError as exc:
        if exc.name in {"matplotlib", "scipy"}:
            raise SystemExit('Reinstall required dependencies: pip install --upgrade humancoin') from exc
        raise
    implementation.run(args)


def desktop_main():
    parser = argparse.ArgumentParser(description="HumanCOIN desktop visualizer")
    parser.add_argument("root", nargs="?", type=Path, help="Dataset directory (default: ./data/demo)")
    parser.add_argument("--episode", type=int, default=0)
    parser.add_argument("--fps", type=float, default=10)
    _run("desktop", parser.parse_args())


def web_main():
    parser = argparse.ArgumentParser(description="HumanCOIN browser visualizer")
    parser.add_argument("root", nargs="?", type=Path, help="Dataset directory (default: newest under ./data/raw)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    _run("web", parser.parse_args())
