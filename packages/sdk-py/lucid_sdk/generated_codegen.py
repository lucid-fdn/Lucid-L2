"""Helper script to (re)generate the OpenAPI-based Python client.

We keep this as a small helper so contributors can run codegen without installing
global python packages. It assumes a local venv at `packages/sdk-py/.venv`.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def main() -> None:
    here = Path(__file__).resolve().parent
    pkg_root = here.parent  # packages/sdk-py
    repo_root = pkg_root.parent.parent  # Lucid-L2-main
    openapi_path = repo_root / "offchain" / "openapi.yaml"
    venv_bin = pkg_root / ".venv" / "bin"
    cli = venv_bin / "openapi-python-client"

    if not cli.exists():
        raise SystemExit(
            "openapi-python-client is not installed in .venv. "
            "Run: python3 -m venv .venv && ./.venv/bin/pip install openapi-python-client"
        )

    out_dir = pkg_root / "lucid_sdk" / "generated"

    subprocess.check_call(
        [
            str(cli),
            "generate",
            "--path",
            str(openapi_path),
            "--output-path",
            str(out_dir),
            "--overwrite",
        ],
        cwd=str(pkg_root),
    )


if __name__ == "__main__":
    main()

