import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.hearsay.data import ROOT, build_split, validate_pair, write_manifest


def main():
    parser = argparse.ArgumentParser(description="bonafide=1, spoof=0; shared deterministic split")
    parser.add_argument("--real-dir", type=Path, required=True)
    parser.add_argument("--fake-dir", type=Path, default=ROOT / "data/DiffSSD")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/hearsay")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--dev-fraction", type=float, default=0.2)
    parser.add_argument("--max-per-class", type=int)
    args = parser.parse_args()
    train, dev = build_split(args.real_dir, args.fake_dir, args.seed, args.dev_fraction, args.max_per_class)
    validate_pair(train, dev)
    for name, rows in [("train", train), ("dev", dev)]:
        write_manifest(args.output_dir / f"{name}_manifest.csv", rows)
    metadata = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()}
    metadata.update(label_convention={"bonafide": 1, "spoof": 0}, train_count=len(train), dev_count=len(dev))
    (args.output_dir / "split_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
