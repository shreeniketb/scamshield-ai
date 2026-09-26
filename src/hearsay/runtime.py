"""Thin wrappers around unchanged supplied models and official metrics."""
import csv
import hashlib
import importlib.util
import json
import platform
import random
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from src.hearsay.data import ROOT


def import_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def environment():
    return dict(python=platform.python_version(), torch=str(torch.__version__),
                cuda=torch.version.cuda, cuda_available=torch.cuda.is_available(),
                gpu=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)


def seed_all(seed, threads=2):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(threads)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def choose_device(name, requested):
    if requested == "auto":
        if name == "aasist" and not torch.cuda.is_available():
            raise RuntimeError("AASIST's supplied launcher requires CUDA. For explicit CPU compatibility testing, pass --device cpu.")
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; no CPU fallback")
    print(f"Device: {device}" + (" (explicit AASIST CPU compatibility run)" if name == "aasist" and device.type == "cpu" else ""), flush=True)
    return device


def model_factory(name, device):
    if name == "aasist":
        config = json.loads((ROOT / "Baseline-AASIST/config/AASIST_ASVspoof5.conf").read_text())
        model = import_file("hearsay_aasist", ROOT / "Baseline-AASIST/models/AASIST.py").Model(config["model_config"])
    elif name == "rawnet2":
        model = import_file("hearsay_rawnet2", ROOT / "HackGTMinDCF/asvspoof5/Baseline-RawNet2/model.py").RawNet2(device)
    else:
        raise ValueError(name)
    return model.to(device)


def datasets(name, train_manifest, dev_manifest):
    if name == "aasist":
        from baselines.aasist.hearsay_dataset import HearsayTrainDataset, HearsayEvalDataset
    else:
        from baselines.rawnet2.hearsay_dataset import HearsayTrainDataset, HearsayEvalDataset
    return HearsayTrainDataset(train_manifest), HearsayEvalDataset(dev_manifest)


def checked_logits(model, waveforms):
    _, logits = model(waveforms)
    if logits.shape != (waveforms.shape[0], 2) or not torch.isfinite(logits).all():
        raise ValueError(f"Invalid classifier output: {logits.shape}")
    return logits


def continuous_scores(name, logits):
    return (logits.softmax(dim=1) if name == "rawnet2" else logits)[:, 1]


def score_model(name, model, dataset, device, batch_size, progress=False):
    model.eval()
    scores = []
    with torch.inference_mode():
        for step, (waveforms, _) in enumerate(DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0), 1):
            scores.extend(continuous_scores(name, checked_logits(model, waveforms.to(device))).cpu().tolist())
            if progress and (step == 1 or step % 10 == 0):
                print(f"{name}: scored {len(scores)}/{len(dataset)}", flush=True)
    if len(scores) != len(dataset) or not np.isfinite(scores).all():
        raise ValueError("Missing/nonfinite inference scores")
    return scores


def write_scores(path, rows, scores, labeled=True):
    if len(rows) != len(scores) or not np.isfinite(scores).all():
        raise ValueError("Score count mismatch or NaN/Inf")
    if len({r["path"] for r in rows}) != len(rows):
        raise ValueError("Duplicate filenames")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, delimiter="\t")
        writer.writerow(["filename", "score"] + (["label"] if labeled else []))
        for row, score in zip(rows, scores):
            writer.writerow([row["path"], format(score, ".17g")] + ([row["class_name"]] if labeled else []))


def evaluate_scores(path, manifest_rows, name, output):
    with Path(path).open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    if [r["filename"] for r in rows] != [r["path"] for r in manifest_rows]:
        raise ValueError("Scores do not exactly match manifest order/count")
    if [r["label"] for r in rows] != [r["class_name"] for r in manifest_rows]:
        raise ValueError("Score labels do not match manifest")
    scores = np.array([float(r["score"]) for r in rows])
    labels = np.array([r["label"] for r in rows])
    if not np.isfinite(scores).all() or set(labels) != {"bonafide", "spoof"}:
        raise ValueError("Finite scores and both classes required")
    official = ROOT / "HackGTMinDCF/asvspoof5/evaluation-package"
    # Load only this package's sibling modules, never similarly named AASIST helpers.
    names = ["calculate_modules", "a_dcf", "util"]
    previous = {n: sys.modules.get(n) for n in names}
    try:
        for n in names:
            sys.modules[n] = import_file(n, official / f"{n}.py")
        metric = import_file("hearsay_official_metrics", official / "calculate_metrics.py")
        values = metric.calculate_minDCF_EER_CLLR_actDCF(scores, labels, None, printout=False)
    finally:
        for n, module in previous.items():
            if module is None:
                sys.modules.pop(n, None)
            else:
                sys.modules[n] = module
    if not np.isfinite(values).all():
        raise ValueError("Official metrics are nonfinite")
    result = dict(model=name, num_samples=len(rows), **dict(zip(["minDCF", "EER", "CLLR", "actDCF"], map(float, values))),
                  EER_unit="fraction", score_semantics="class-1 logit" if name == "aasist" else "class-1 softmax probability",
                  cost_model=dict(Pspoof=0.5, Cmiss=1, Cfa=4),
                  note="Uncalibrated baseline scores; CLLR applies the official LLR formula directly.")
    save_json(output, result)
    return result


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False), encoding="utf-8")
