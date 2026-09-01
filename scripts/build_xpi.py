#!/usr/bin/env python3
from __future__ import annotations

import argparse
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "dist" / "cortex-for-zotero.xpi"
EXCLUDED_PARTS = {"dist", "tests", "scripts", "__pycache__"}
EXCLUDED_NAMES = {"update.json"}


def build_xpi(output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(PROJECT_ROOT.rglob("*")):
            relative = path.relative_to(PROJECT_ROOT)
            if (
                not path.is_file()
                or any(part in EXCLUDED_PARTS for part in relative.parts)
                or any(part.startswith(".") for part in relative.parts)
                or path.name in EXCLUDED_NAMES
                or path.suffix == ".md"
            ):
                continue
            archive.write(path, relative)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Cortex as an XPI archive.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(build_xpi(args.output.resolve()))


if __name__ == "__main__":
    main()
