"""Download HumanCOIN dataset snapshots from Hugging Face or ModelScope."""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

DEFAULT_ROOT = Path.home() / ".cache" / "huggingface" / "lerobot"


def resolve_repo_id(name: str, namespace: str = "HumanCOIN") -> str:
    """Accept a dataset name or an explicit owner/name, never a local path."""
    repo_id = name if "/" in name else f"{namespace}/{name}"
    parts = repo_id.split("/")
    if len(parts) != 2 or any(
        not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", part)
        or ".." in part for part in parts
    ):
        raise ValueError(f"Expected a dataset name or owner/name, got {name!r}")
    return repo_id


def download_dataset(
    name: str,
    *,
    hub: str = "huggingface",
    target_dir: str | Path = DEFAULT_ROOT,
    namespace: str = "HumanCOIN",
    revision: str | None = None,
    token: str | None = None,
    max_workers: int = 8,
    allow_patterns: list[str] | None = None,
    ignore_patterns: list[str] | None = None,
) -> Path:
    """Download raw repository files into target_dir/owner/name.

    SDK snapshot caching allows subsequent calls to reuse downloaded files.
    No conversion or dataset loading is performed.
    """
    repo_id = resolve_repo_id(name, namespace)
    if max_workers < 1:
        raise ValueError("max_workers must be positive")
    destination = Path(target_dir).expanduser().resolve() / repo_id
    kwargs = {"local_dir": str(destination), "max_workers": max_workers}
    if revision is not None:
        kwargs["revision"] = revision
    if allow_patterns is not None:
        kwargs["allow_patterns"] = allow_patterns
    if ignore_patterns is not None:
        kwargs["ignore_patterns"] = ignore_patterns
    if hub == "huggingface":
        try:
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise RuntimeError('Reinstall download dependencies: pip install --upgrade humancoin-lerobot') from exc
        snapshot_download(
            repo_id=repo_id, repo_type="dataset",
            token=token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN"),
            **kwargs,
        )
    elif hub == "modelscope":
        try:
            from modelscope_hub import HubApi
        except ImportError as exc:
            raise RuntimeError('Reinstall download dependencies: pip install --upgrade humancoin-lerobot') from exc
        access_token = token or os.environ.get("MODELSCOPE_TOKEN") or os.environ.get("MS_TOKEN") or os.environ.get("MODELSCOPE_API_TOKEN")
        # Pass credentials to this client without changing global login state.
        HubApi(token=access_token).download_repo(repo_id=repo_id, repo_type="dataset", **kwargs)
    else:
        raise ValueError(f"Unsupported hub: {hub}")
    return destination


def _error_detail(exc: Exception, token: str | None) -> str:
    """Show actionable HTTP diagnostics without request headers or credentials."""
    parts = [type(exc).__name__]
    response = getattr(exc, "response", None)
    if response is not None:
        status = getattr(response, "status_code", None)
        if status is not None:
            parts.append(f"HTTP {status}")
        try:
            payload = response.json()
            if isinstance(payload, dict):
                message = payload.get("error") or payload.get("message") or payload.get("Message")
                if isinstance(message, str):
                    parts.append(message)
        except (ValueError, TypeError):
            pass
    elif isinstance(exc, RuntimeError) and isinstance(exc.__cause__, ImportError):
        parts.append(str(exc))
    message = " | ".join(parts)
    secrets = [token] + [v for k, v in os.environ.items() if v and ("TOKEN" in k.upper() or "SECRET" in k.upper())]
    for secret in sorted((v for v in secrets if v), key=len, reverse=True):
        message = message.replace(secret, "[REDACTED]")
    message = re.sub(r"(?i)Bearer\s+[^\s,;]+", "Bearer [REDACTED]", message)
    message = re.sub(r"\bhf_[A-Za-z0-9]+", "[REDACTED]", message)
    return " ".join(message.split())[:1500]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hub", choices=["huggingface", "modelscope"], default="huggingface")
    parser.add_argument("--datasets", "--ds_lists", nargs="+", required=True)
    parser.add_argument("--namespace", default="HumanCOIN")
    parser.add_argument("--target-dir", "--output_dir", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--revision", help="Hub branch, tag or revision (SDK default if omitted)")
    parser.add_argument("--token", help="Access token; prefer HF_TOKEN or MODELSCOPE_TOKEN")
    parser.add_argument("--max-workers", "--max_workers", type=int, default=8)
    parser.add_argument("--include", nargs="+", help="Download only matching relative-path glob patterns")
    parser.add_argument("--exclude", nargs="+", help="Skip matching relative-path glob patterns")
    parser.add_argument("--dry-run", "--dry_run", action="store_true")
    args = parser.parse_args(argv)
    if args.max_workers < 1:
        parser.error("--max-workers must be positive")
    try:
        repos = list(dict.fromkeys(resolve_repo_id(n, args.namespace) for n in args.datasets))
    except ValueError as exc:
        parser.error(str(exc))
    failed = False
    for repo in repos:
        destination = args.target_dir.expanduser().resolve() / repo
        print(f"{args.hub}: {repo} -> {destination}")
        if args.dry_run:
            if args.include:
                print(f"  Include: {args.include}")
            if args.exclude:
                print(f"  Exclude: {args.exclude}")
            continue
        try:
            download_dataset(
                repo, hub=args.hub, target_dir=args.target_dir,
                revision=args.revision, token=args.token, max_workers=args.max_workers,
                allow_patterns=args.include, ignore_patterns=args.exclude,
            )
            print(f"Downloaded: {destination}")
        except Exception as exc:
            print(f"Failed: {repo}: {_error_detail(exc, args.token)}. Check network, repository access and credentials.", file=sys.stderr)
            failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
