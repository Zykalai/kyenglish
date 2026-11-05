# -*- coding: utf-8 -*-
"""Download the pinned ECDICT csv used to build the direct dictionary.

The 66MB file is intentionally not committed. This script fetches the exact
upstream revision and verifies its SHA256 before replacing data/dict/ecdict.csv.

Usage:
    python tools/lexicon/download_ecdict.py
    python tools/lexicon/download_ecdict.py --force
"""
import argparse
import hashlib
import os
import sys
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
DEFAULT_DEST = BASE / "data" / "dict" / "ecdict.csv"

# ECDICT commit 9c46923 (2026-10-20), the revision this project was built from.
DEFAULT_URL = (
    "https://raw.githubusercontent.com/skywind3000/ECDICT/"
    "9c46923fb81a2eb6c264a3a1689562ea7bc56b6a/ecdict.csv"
)
DEFAULT_SHA256 = "d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"
DEFAULT_SIZE = 66009548


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(path, size, digest):
    actual_size = path.stat().st_size
    if actual_size != size:
        return False, f"size {actual_size:,} != {size:,}"
    actual = sha256_of(path)
    if actual != digest:
        return False, f"sha256 {actual} != {digest}"
    return True, "ok"


def main():
    parser = argparse.ArgumentParser(description="Download the pinned ECDICT csv")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--sha256", default=DEFAULT_SHA256)
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE)
    parser.add_argument("--dest", default=str(DEFAULT_DEST))
    parser.add_argument("--force", action="store_true", help="re-download even if the file already verifies")
    args = parser.parse_args()

    dest = Path(args.dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and not args.force:
        ok, detail = verify(dest, args.size, args.sha256)
        if ok:
            print(f"ECDICT already present and verified: {dest}")
            print(f"sha256: {args.sha256}")
            return 0
        print(f"Existing file does not match: {detail}", file=sys.stderr)
        print("Use --force to replace it, or delete it and rerun.", file=sys.stderr)
        return 1

    tmp = dest.with_name(dest.name + ".part")
    print(f"Downloading {args.url}")
    print(f"  -> {tmp}")
    req = urllib.request.Request(args.url, headers={"User-Agent": "kyenglish/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        last_report = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if done - last_report >= 10 * 1024 * 1024:
                pct = f" ({done * 100 // total}%)" if total else ""
                print(f"  {done / 1048576:.1f} MB{pct}", file=sys.stderr)
                last_report = done
    print(f"Downloaded {done / 1048576:.1f} MB", file=sys.stderr)

    ok, detail = verify(tmp, args.size, args.sha256)
    if not ok:
        tmp.unlink(missing_ok=True)
        print(f"Verification failed: {detail}", file=sys.stderr)
        return 1

    os.replace(tmp, dest)
    print(f"Saved and verified: {dest}")
    print(f"sha256: {args.sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
