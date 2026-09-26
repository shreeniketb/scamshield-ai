# HackGT baseline integration

Run commands below from `D:\Georgia Tech\Fall_2026\scamshield-ai` in PowerShell.
The supplied architectures and original entry points are unchanged. The new wrappers
import `Baseline-AASIST/models/AASIST.py` with its supplied configuration and
`HackGTMinDCF/asvspoof5/Baseline-RawNet2/model.py` directly. The second AASIST copy
inside HackGTMinDCF has the same model SHA256 as the top-level copy.

## Data and score contracts

- `data/resampled` is the discovered real corpus (242 LJ-named WAVs). No directory
  named `LJRealResampled` was supplied. The explicit `--real-dir` argument maps this
  corpus to source `LJRealResampled`, **bonafide=1**. Confirm its provenance before
  treating smoke results as a competition benchmark.
- `data/DiffSSD` contains 65,000 WAVs and 5,000 MP3s across nested generators.
  Discovery supports WAV, FLAC, and MP3, including mixed-case extensions. It excludes
  archives and non-audio files. Unreadable selected files raise errors with their paths.
- `data/HackGTHearsayTesting` contains 1,671 WAVs. Its accompanying CSV is never read;
  no labels are inferred and no final-test audio enters training or model selection.
- Manifests use repository-relative forward-slash paths (absolute paths only for
  explicitly selected external corpora). Duplicate basenames in different generators
  remain distinct. Score `filename` is the complete manifest path, not just the basename.
- A fixed seed selects and splits each class independently, 80/20 by default.
  Both wrappers validate the same manifests, including class/source mappings and overlap.
  This is a file-level stratified split, not a speaker/text/generator-disjoint benchmark.
- The in-memory loader was extracted from the existing WavLM utility into
  `src/audio/waveform.py`, with contextual errors and pre/post finiteness checks.
  WavLM re-exports this shared loader. It averages channels, resamples through torchaudio,
  returns contiguous float32 at 16 kHz, and rejects clips shorter than 25 ms.
- AASIST receives 64,600 samples; RawNet2 receives 64,000. Short clips repeat.
  Train crops are random, including the last legal offset; dev/test crops start at zero.
  Equal-length training clips work (avoiding the originals' `randint(0)` edge case).
- AASIST scores are class-1 logits. RawNet2 scores are class-1 softmax probabilities,
  matching their original evaluation paths. Higher always means more bonafide.
  Scores are continuous, never thresholded. No fusion or calibration is performed.
- Metrics call the supplied `calculate_minDCF_EER_CLLR_actDCF` directly. Its cost model
  is Pspoof=0.5, Cmiss=1, Cfa=4. JSON EER is a fraction; report EER is a percentage.
  CLLR is reported on uncalibrated baseline scores using the official LLR formula;
  probability/logit scores should not be interpreted as calibrated likelihood ratios.

## PowerShell verification commands

```powershell
Set-Location 'D:\Georgia Tech\Fall_2026\scamshield-ai'
$python = '.\.venv\Scripts\python.exe'

# 1. Environment and dependencies (install only if needed)
& $python -m pip install -r requirements-baselines.txt
& $python -c "from src.hearsay.runtime import environment; print(environment())"

# 2. Shared 100 real + 100 fake smoke manifests: 160 train, 40 dev
& $python scripts/build_hearsay_manifest.py --real-dir data/resampled --max-per-class 100

# 3. Discovery, overlap, six real audio loads, tensor lengths, deterministic dev
& $python scripts/check_hearsay.py

# 4-5. Real batch forward, loss, backward; no optimizer step or checkpoint
& $python scripts/train_aasist_hearsay.py --device cpu --batch-size 4 --one-batch
& $python scripts/train_rawnet2_hearsay.py --device cpu --batch-size 4 --one-batch

# Optional forward-only mode (no backward or training)
& $python scripts/train_aasist_hearsay.py --device cpu --batch-size 4 --forward-only

# 6-7. One epoch each on the identical split; saves checkpoints, scores, metrics
& $python scripts/train_aasist_hearsay.py --device cpu --batch-size 4 --epochs 1
& $python scripts/train_rawnet2_hearsay.py --device cpu --batch-size 4 --epochs 1

# 8. Re-run official metrics against manifest ordering and labels
& $python scripts/evaluate_baselines.py --model aasist --scores results/aasist/dev_scores.tsv --dev-manifest data/hearsay/dev_manifest.csv --output results/aasist/dev_metrics.json
& $python scripts/evaluate_baselines.py --model rawnet2 --scores results/rawnet2/dev_scores.tsv --dev-manifest data/hearsay/dev_manifest.csv --output results/rawnet2/dev_metrics.json

# Automated tests; the opt-in adds both supplied-model forward/backward tests
$env:HEARSAY_MODEL_TESTS = '1'
& $python -m pytest tests/test_hearsay_baselines.py -q
Remove-Item Env:\HEARSAY_MODEL_TESTS

# 9. After both models have successful verification records
& $python scripts/infer_baselines.py --device cpu --batch-size 8 --threads 4
& $python scripts/report_baselines.py
```

All training flags are shared: `--train-manifest`, `--dev-manifest`, `--epochs`,
`--batch-size`, `--device`, `--output-dir`, `--seed`, and `--threads`.
The recorded environment is CPU-only. Explicit `--device cpu` is an AASIST compatibility
override: `--device auto` retains the supplied launcher's CUDA requirement, and
`--device cuda` never silently falls back. CUDA performance and memory use are unverified.
Windows reports a GeForce MX350 (2,048 MiB, driver 441.45), but this Python environment
contains a CPU-only torch build. See `results/hardware.json` for the direct hardware query.
On a CUDA-enabled installation, use `--device cuda`; if memory is exhausted, rerun
with `--batch-size 2`. No data is dropped: a singleton final training batch joins
the preceding batch to support batch normalization.

Training uses the supplied weighted cross-entropy [0.1, 0.9] and Adam at lr=0.0001,
weight_decay=0.0001. These thin smoke wrappers use constant learning rate, no frequency
augmentation, and no automatic best-model selection. They are integration checks,
not reproductions of full competition training recipes. Each epoch saves a checkpoint;
`dev_scores.tsv` and `dev_metrics.json` correspond to the last epoch.

To build the full labeled split without overwriting smoke manifests:

```powershell
& $python scripts/build_hearsay_manifest.py --real-dir data/resampled --output-dir data/hearsay_full
```

No long full-corpus training is launched automatically. The available full corpus is
highly imbalanced (242 real versus 70,000 fake); the smoke selection is balanced.
Existing scripts in `test/` use stale hard-coded paths and perform unrelated model
downloads at import time, so the new baseline suite is targeted explicitly above.
