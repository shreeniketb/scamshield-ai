"""Build a comparison from actual verification records, never placeholder metrics."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.hearsay.data import ROOT, read_manifest
from src.hearsay.runtime import digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", type=Path, default=ROOT / "results")
    parser.add_argument("--dev-manifest", type=Path, default=ROOT / "data/hearsay/dev_manifest.csv")
    args = parser.parse_args()
    records = []
    for name in ["aasist", "rawnet2"]:
        record = json.loads((args.results_dir / name / "verification.json").read_text())
        if record["status"] != "VERIFIED" or not (ROOT / record["checkpoint"]).is_file():
            raise ValueError(f"Incomplete verification: {name}")
        if record["dev_manifest_sha256"] != digest(args.dev_manifest):
            raise ValueError(f"Changed dev manifest: {name}")
        records.append(record)
    if records[0]["train_manifest_sha256"] != records[1]["train_manifest_sha256"]:
        raise ValueError("Models used different training manifests")
    lines = ["# Baseline comparison", "", "Both supplied architectures completed one-epoch CPU compatibility smoke training.",
             "CUDA is unavailable and remains unverified. These are smoke results, not accuracy claims.", "",
             "| Model | Train N | Dev N | Epochs | EER (%) | minDCF | CLLR | Status |",
             "|---|---:|---:|---:|---:|---:|---:|---|"]
    for r in records:
        m = r["history"][-1]
        lines.append(f"| {r['model']} | {r['train_samples']} | {r['dev_samples']} | {r['epochs']} | "
                     f"{100*m['EER']:.3f} | {m['minDCF']:.6f} | {m['CLLR']:.6f} | PASS (CPU) |")
    lines.extend(["", "## Environment", "", "```json", json.dumps(records[0]["environment"], indent=2), "```",
                  "", "## Evidence", "",
                  "Shared split: seed 1234, 100 real + 100 fake; train 80+80, dev 20+20.",
                  "Full discovered corpora: 242 real WAVs; 65,000 fake WAVs + 5,000 fake MP3s; 1,671 final-test WAVs.",
                  "The real corpus is explicitly mapped from `data/resampled` to source `LJRealResampled`.",
                  "No final-test labels or audio were used in training or model selection.", "",
                  f"Dev manifest SHA256: `{digest(args.dev_manifest)}`.", ""])
    hardware = args.results_dir / "hardware.json"
    if hardware.exists():
        lines.extend(["Detected hardware (separate from CUDA availability in PyTorch):", "",
                      "```json", hardware.read_text(), "```", ""])
    for r in records:
        lines.extend([f"### {r['model']}", "",
                      f"- Parameters: {r['parameter_count']:,}; device: {r['device']}.",
                      f"- Mean training loss: {r['history'][-1]['loss']:.9f}.",
                      f"- Runtime: {r['elapsed_seconds']:.1f} seconds.",
                      f"- Checkpoint: `{r['checkpoint']}`.",
                      f"- Scores: `results/{r['model']}/dev_scores.tsv` ({len(read_manifest(args.dev_manifest))} rows).",
                      f"- Official metrics: `results/{r['model']}/dev_metrics.json`.",
                      f"- Execution details and hashes: `results/{r['model']}/verification.json`.", ""])
    lines.extend(["## Changes and limitations", "",
                  "No supplied baseline architecture or original script was edited. New dataset adapters, wrappers,",
                  "shared manifests, metric integration, and tests were added. The existing WavLM loader now imports",
                  "the common in-memory loader. Training uses constant-lr Adam and the supplied weighted CE;",
                  "no frequency augmentation, score fusion, or calibration was added.", "",
                  "AASIST uses class-1 logits; RawNet2 uses class-1 softmax probabilities. Higher means bonafide.",
                  "Official Track 1 costs: Pspoof=0.5, Cmiss=1, Cfa=4. JSON EER is a fraction.",
                  "CLLR is evaluated directly on these uncalibrated scores with the supplied implementation.", "",
                  "The file-level split does not guarantee speaker, text, or generator independence. The real corpus",
                  "directory name differs from the request; confirm data provenance before a benchmark run.",
                  "CUDA verification is the remaining hardware limitation; the explicit CPU override passed.", "",
                  "## Commands and tests", "",
                  "Exact PowerShell commands are in [the runbook](../docs/hearsay_baselines.md).",
                  "The targeted suite covers manifests, waveform edge cases, tensors, real data, official metrics,",
                  "score validation, and both supplied-model forward/backward passes.",
                  "See `execution_log.md` for commands actually executed and recovered failures.", ""])
    test_result = args.results_dir / "test_inference_verification.json"
    if test_result.exists():
        lines.extend(["## Final-test inference", "", "```json", test_result.read_text(), "```", ""])
    execution_log = args.results_dir / "execution_log.md"
    if execution_log.exists():
        lines.extend(["## Executed commands and recovered failures", "", execution_log.read_text(), ""])
    (args.results_dir / "baseline_comparison.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
