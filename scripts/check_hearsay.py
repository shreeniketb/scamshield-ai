import argparse
import sys
from pathlib import Path
import torch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.audio.waveform import load_waveform
from src.hearsay.data import ROOT, read_manifest, resolve_audio, validate_pair
from src.hearsay.runtime import datasets, environment

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-manifest", default=ROOT / "data/hearsay/train_manifest.csv")
    parser.add_argument("--dev-manifest", default=ROOT / "data/hearsay/dev_manifest.csv")
    args = parser.parse_args()
    print(environment())
    train, dev = read_manifest(args.train_manifest), read_manifest(args.dev_manifest)
    validate_pair(train, dev)
    for label in [0, 1]:
        for row in [r for r in train + dev if r["label"] == label][:3]:
            x = load_waveform(resolve_audio(row["path"]))
            assert x.dtype == torch.float32 and x.ndim == 1 and torch.isfinite(x).all() and x.numel()
            print(f"{row['path']}: shape={list(x.shape)}, duration={len(x)/16000:.3f}s, rate=16000")
    for name, length in [("aasist", 64600), ("rawnet2", 64000)]:
        train_ds, dev_ds = datasets(name, args.train_manifest, args.dev_manifest)
        for ds in [train_ds, dev_ds]:
            x, y = ds[0]
            assert x.shape == (length,) and y in {0, 1}
        assert torch.equal(dev_ds[0][0], dev_ds[0][0])
        print(f"PASS {name}: shape=[{length}], valid labels, deterministic dev")
