"""Unlabeled final-test inference, gated on successful verification of BOTH models."""
import argparse
import csv
import json
import sys
from pathlib import Path
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.hearsay.data import ROOT, ManifestDataset, discover, portable_path, write_manifest
from src.hearsay.runtime import (choose_device, digest, model_factory, save_json, score_model,
                                 seed_all, write_scores)


def verification_records(results_dir):
    records = {}
    for name in ["aasist", "rawnet2"]:
        directory = results_dir / name
        record = json.loads((directory / "verification.json").read_text())
        if record["status"] != "VERIFIED":
            raise ValueError(f"{name} has not been verified")
        for path, key in [(ROOT / record["checkpoint"], "checkpoint_sha256"),
                          (directory / "dev_scores.tsv", "dev_scores_sha256"),
                          (ROOT / "src/audio/waveform.py", "waveform_loader_sha256")]:
            if digest(path) != record[key]:
                raise ValueError(f"Changed verification artifact: {path}")
        records[name] = record
    for key in ["train_manifest_sha256", "dev_manifest_sha256"]:
        if records["aasist"][key] != records["rawnet2"][key]:
            raise ValueError("Baselines were verified on different splits")
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-dir", type=Path, default=ROOT / "data/HackGTHearsayTesting")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/hearsay/test_manifest.csv")
    parser.add_argument("--results-dir", type=Path, default=ROOT / "results")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    if args.batch_size < 1 or args.threads < 1:
        parser.error("Positive batch-size and threads required")
    records = verification_records(args.results_dir)
    (args.results_dir / "test_inference_verification.json").unlink(missing_ok=True)
    seed_all(1234, args.threads)
    rows = [{"path": portable_path(p)} for p in discover(args.test_dir)]
    write_manifest(args.manifest, rows, fields=["path"])
    print(f"Discovered {len(rows)} unlabeled test files", flush=True)
    evidence = {"test_files": len(rows), "manifest_sha256": digest(args.manifest), "models": {}}
    for name, length in [("aasist", 64600), ("rawnet2", 64000)]:
        device = choose_device(name, args.device)
        model = model_factory(name, device)
        checkpoint = torch.load(ROOT / records[name]["checkpoint"], map_location=device, weights_only=True)
        if checkpoint["model"] != name:
            raise ValueError("Checkpoint model mismatch")
        for key in ["train_manifest_sha256", "dev_manifest_sha256"]:
            if checkpoint[key] != records[name][key]:
                raise ValueError("Checkpoint split differs from verified split")
        model.load_state_dict(checkpoint["state_dict"])
        dataset = ManifestDataset(args.manifest, length, labeled=False)
        scores = score_model(name, model, dataset, device, args.batch_size, progress=True)
        destination = args.results_dir / name / "test_scores.tsv"
        write_scores(destination, rows, scores, labeled=False)
        with destination.open(newline="", encoding="utf-8") as stream:
            output = list(csv.DictReader(stream, delimiter="\t"))
        if [r["filename"] for r in output] != [r["path"] for r in rows]:
            raise ValueError("Test output filenames/order/count mismatch")
        evidence["models"][name] = dict(num_scores=len(output), finite=True, unique=True,
                                        scores_sha256=digest(destination), checkpoint_sha256=records[name]["checkpoint_sha256"])
        print(f"PASS {name}: {len(output)} finite unique scores for {len(rows)} files", flush=True)
        del checkpoint, model
    save_json(args.results_dir / "test_inference_verification.json", evidence)


if __name__ == "__main__":
    main()
