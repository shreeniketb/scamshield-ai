"""Shared split and manifest contracts: bonafide=1, spoof=0, repository-relative paths."""
import csv
import random
from collections import Counter
from pathlib import Path

from torch.utils.data import Dataset
from src.audio.waveform import crop_or_repeat, load_waveform

ROOT = Path(__file__).resolve().parents[2]
EXTENSIONS = {".wav", ".flac", ".mp3"}
FIELDS = ["path", "label", "class_name", "source"]


def discover(directory):
    directory = Path(directory).resolve()
    if not directory.is_dir():
        raise FileNotFoundError(directory)
    paths = sorted({p.resolve() for p in directory.rglob("*")
                    if p.is_file() and p.suffix.lower() in EXTENSIONS})
    if not paths:
        raise ValueError(f"No supported audio in {directory}")
    return paths


def portable_path(path):
    path = Path(path).resolve()
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def resolve_audio(path):
    return (ROOT / path).resolve()


def reject_test(path):
    if any(part.casefold() == "hackgthearsaytesting" for part in Path(path).parts):
        raise ValueError(f"Final test audio cannot enter labeled manifests: {path}")


def build_split(real_dir, fake_dir, seed=1234, dev_fraction=0.2, max_per_class=None):
    if not 0 < dev_fraction < 1:
        raise ValueError("dev_fraction must be between 0 and 1")
    if max_per_class is not None and max_per_class < 2:
        raise ValueError("max_per_class must be at least 2")
    train, dev, seen = [], [], set()
    rng = random.Random(seed)
    for directory, label, name, source in [(real_dir, 1, "bonafide", "LJRealResampled"),
                                           (fake_dir, 0, "spoof", "DiffSSD")]:
        paths = discover(directory)
        for path in paths:
            reject_test(path)
            if path in seen:
                raise ValueError(f"Duplicate/class-overlapping path: {path}")
            seen.add(path)
        rng.shuffle(paths)
        if max_per_class is not None:
            paths = paths[:max_per_class]
        if len(paths) < 2:
            raise ValueError(f"Need at least two {name} samples for train/dev")
        rows = [dict(path=portable_path(p), label=label, class_name=name, source=source) for p in paths]
        ndev = max(1, min(len(rows) - 1, round(len(rows) * dev_fraction)))
        dev.extend(rows[:ndev])
        train.extend(rows[ndev:])
    return sorted(train, key=lambda x: x["path"]), sorted(dev, key=lambda x: x["path"])


def write_manifest(path, rows, fields=FIELDS):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def read_manifest(path, labeled=True):
    with Path(path).open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        required = set(FIELDS if labeled else ["path"])
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Missing columns {required}: {path}")
        rows = list(reader)
    if not rows:
        raise ValueError(f"Empty manifest: {path}")
    seen = set()
    for row in rows:
        resolved = resolve_audio(row["path"])
        if not resolved.is_file():
            raise FileNotFoundError(resolved)
        if resolved in seen:
            raise ValueError(f"Duplicate path: {resolved}")
        seen.add(resolved)
        if labeled:
            reject_test(resolved)
            row["label"] = int(row["label"])
            expected = {0: ("spoof", "DiffSSD"), 1: ("bonafide", "LJRealResampled")}
            if expected.get(row["label"]) != (row["class_name"], row["source"]):
                raise ValueError(f"Invalid label/class/source: {row}")
    return rows


def validate_pair(train, dev):
    if {resolve_audio(r["path"]) for r in train} & {resolve_audio(r["path"]) for r in dev}:
        raise ValueError("Train/dev overlap")
    for name, rows in [("train", train), ("dev", dev)]:
        if {r["label"] for r in rows} != {0, 1}:
            raise ValueError(f"Both classes required in {name}")
        print(f"{name}: {dict(Counter(r['class_name'] for r in rows))}; "
              f"sources={dict(Counter(r['source'] for r in rows))}", flush=True)


class ManifestDataset(Dataset):
    def __init__(self, manifest, length, training=False, labeled=True):
        self.rows = read_manifest(manifest, labeled=labeled)
        self.length, self.training, self.labeled = length, training, labeled

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        waveform = crop_or_repeat(load_waveform(resolve_audio(row["path"])), self.length, self.training)
        return waveform, row["label"] if self.labeled else row["path"]
