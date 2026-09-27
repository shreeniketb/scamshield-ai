import argparse
import csv
import importlib.util
import json
import math
import sys
from pathlib import Path

import torch
import torchaudio
from torch.utils.data import DataLoader, Dataset


# ============================================================
# CONSTANTS
# ============================================================

AASIST_LENGTH = 64600
RAWNET2_LENGTH = 64000
TARGET_SAMPLE_RATE = 16000


# ============================================================
# AUDIO
# ============================================================

def load_audio(path: Path) -> torch.Tensor:
    waveform, sample_rate = torchaudio.load(str(path))

    # Convert stereo -> mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Resample
    if sample_rate != TARGET_SAMPLE_RATE:
        waveform = torchaudio.functional.resample(
            waveform,
            sample_rate,
            TARGET_SAMPLE_RATE,
        )

    return waveform.squeeze(0)


def repeat_or_crop(waveform: torch.Tensor, target_length: int) -> torch.Tensor:
    """
    Match training-time fixed-length preprocessing.

    If waveform is too short:
        repeat it until target_length

    If waveform is too long:
        truncate to target_length
    """

    length = waveform.numel()

    if length == 0:
        raise ValueError("Empty waveform")

    if length < target_length:
        repeats = math.ceil(target_length / length)
        waveform = waveform.repeat(repeats)

    return waveform[:target_length]


# ============================================================
# DATASET
# ============================================================

class AudioDataset(Dataset):
    def __init__(self, files: list[Path], target_length: int):
        self.files = files
        self.target_length = target_length

    def __len__(self):
        return len(self.files)

    def __getitem__(self, index):
        path = self.files[index]

        waveform = load_audio(path)
        waveform = repeat_or_crop(
            waveform,
            self.target_length,
        )

        return waveform, path.name


# ============================================================
# DYNAMIC IMPORT HELPERS
# ============================================================

def import_module_from_file(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(
        module_name,
        str(file_path),
    )

    if spec is None or spec.loader is None:
        raise ImportError(
            f"Unable to import {file_path}"
        )

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    return module


# ============================================================
# LOAD AASIST
# ============================================================

def load_aasist(
    checkpoint_path: Path,
    device: torch.device,
    repo_root: Path,
):

    aasist_dir = repo_root / "Baseline-AASIST"

    model_file = aasist_dir / "models" / "AASIST.py"
    config_file = (
        aasist_dir
        / "config"
        / "AASIST_ASVspoof5.conf"
    )

    if not model_file.exists():
        raise FileNotFoundError(
            f"AASIST model file not found: {model_file}"
        )

    if not config_file.exists():
        raise FileNotFoundError(
            f"AASIST config not found: {config_file}"
        )

    # AASIST model may import modules relative to its repo
    sys.path.insert(
        0,
        str(aasist_dir),
    )

    aasist_module = import_module_from_file(
        "aasist_model",
        model_file,
    )

    Model = aasist_module.Model

    with config_file.open(
        "r",
        encoding="utf-8",
    ) as f:
        config = json.load(f)

    model = Model(
        config["model_config"]
    )

    checkpoint = torch.load(
        checkpoint_path,
        map_location=device,
        weights_only=True,
    )

    if (
        isinstance(checkpoint, dict)
        and "state_dict" in checkpoint
    ):
        state_dict = checkpoint["state_dict"]
    else:
        state_dict = checkpoint

    model.load_state_dict(
        state_dict
    )

    model = model.to(device)
    model.eval()

    return model


# ============================================================
# LOAD RAWNET2
# ============================================================

def load_rawnet2(
    checkpoint_path: Path,
    device: torch.device,
    repo_root: Path,
):

    rawnet_file = (
        repo_root
        / "HackGTMinDCF"
        / "asvspoof5"
        / "Baseline-RawNet2"
        / "model.py"
    )

    if not rawnet_file.exists():
        raise FileNotFoundError(
            f"RawNet2 model file not found: {rawnet_file}"
        )

    rawnet_module = import_module_from_file(
        "rawnet2_model",
        rawnet_file,
    )

    RawNet2 = rawnet_module.RawNet2

    model = RawNet2(
        device
    )

    checkpoint = torch.load(
        checkpoint_path,
        map_location=device,
        weights_only=True,
    )

    if (
        isinstance(checkpoint, dict)
        and "state_dict" in checkpoint
    ):
        state_dict = checkpoint["state_dict"]
    else:
        state_dict = checkpoint

    model.load_state_dict(
        state_dict
    )

    model = model.to(device)
    model.eval()

    return model


# ============================================================
# MODEL OUTPUT NORMALIZATION
# ============================================================

def extract_logits(output):
    """
    Handle models returning:
        tensor
        tuple
        list
        dict
    """

    if isinstance(output, torch.Tensor):
        return output

    if isinstance(output, (tuple, list)):
        for item in output:
            if (
                isinstance(item, torch.Tensor)
                and item.ndim >= 2
            ):
                return item

    if isinstance(output, dict):
        for key in (
            "logits",
            "output",
            "scores",
        ):
            if key in output:
                return output[key]

    raise TypeError(
        f"Unsupported model output type: {type(output)}"
    )


# ============================================================
# SCORE AASIST
# ============================================================

@torch.inference_mode()
def score_aasist(
    model,
    files: list[Path],
    device: torch.device,
    batch_size: int,
):

    dataset = AudioDataset(
        files,
        AASIST_LENGTH,
    )

    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )

    scores = {}

    total = len(files)
    processed = 0

    for waveforms, filenames in loader:

        waveforms = waveforms.to(
            device,
            non_blocking=True,
        )

        output = model(
            waveforms
        )

        logits = extract_logits(
            output
        )

        # Your AASIST evaluation uses:
        # class-1 logit
        #
        # Convert to probability for fusion.
        class1_logits = logits[:, 1]

        probabilities = torch.sigmoid(
            class1_logits
        )

        probabilities = (
            probabilities
            .detach()
            .cpu()
            .tolist()
        )

        for filename, score in zip(
            filenames,
            probabilities,
        ):
            scores[filename] = float(score)

        processed += len(filenames)

        print(
            f"AASIST: {processed}/{total}"
        )

    return scores


# ============================================================
# SCORE RAWNET2
# ============================================================

@torch.inference_mode()
def score_rawnet2(
    model,
    files: list[Path],
    device: torch.device,
    batch_size: int,
):

    dataset = AudioDataset(
        files,
        RAWNET2_LENGTH,
    )

    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )

    scores = {}

    total = len(files)
    processed = 0

    for waveforms, filenames in loader:

        waveforms = waveforms.to(
            device,
            non_blocking=True,
        )

        output = model(
            waveforms
        )

        logits = extract_logits(
            output
        )

        # Your RawNet2 evaluation uses:
        # class-1 softmax probability
        probabilities = torch.softmax(
            logits,
            dim=1,
        )[:, 1]

        probabilities = (
            probabilities
            .detach()
            .cpu()
            .tolist()
        )

        for filename, score in zip(
            filenames,
            probabilities,
        ):
            scores[filename] = float(score)

        processed += len(filenames)

        print(
            f"RawNet2: {processed}/{total}"
        )

    return scores


# ============================================================
# WRITE TSV
# ============================================================

def write_scores(
    scores: dict[str, float],
    output_path: Path,
):

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as f:

        writer = csv.writer(
            f,
            delimiter="\t",
        )

        writer.writerow(
            [
                "filename",
                "cm-score",
            ]
        )

        for filename in sorted(scores):

            writer.writerow(
                [
                    filename,
                    f"{scores[filename]:.10f}",
                ]
            )


# ============================================================
# ENSEMBLE
# ============================================================

def ensemble_scores(
    aasist_scores: dict[str, float],
    rawnet2_scores: dict[str, float],
    alpha: float,
):

    aasist_files = set(
        aasist_scores
    )

    rawnet_files = set(
        rawnet2_scores
    )

    if aasist_files != rawnet_files:

        only_aasist = (
            aasist_files
            - rawnet_files
        )

        only_rawnet = (
            rawnet_files
            - aasist_files
        )

        raise RuntimeError(
            "Model outputs contain different files.\n"
            f"Only AASIST: {len(only_aasist)}\n"
            f"Only RawNet2: {len(only_rawnet)}"
        )

    ensemble = {}

    for filename in aasist_scores:

        aasist = aasist_scores[
            filename
        ]

        rawnet = rawnet2_scores[
            filename
        ]

        # alpha = RawNet2 weight
        # 1-alpha = AASIST weight
        score = (
            alpha * rawnet
            + (1.0 - alpha) * aasist
        )

        ensemble[filename] = score

    return ensemble


# ============================================================
# MAIN
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "Score HackGT Hearsay testing data "
            "using AASIST + RawNet2 ensemble."
        )
    )

    parser.add_argument(
        "--test-dir",
        default="data/HackGTHearsayTesting",
    )

    parser.add_argument(
        "--aasist-checkpoint",
        required=True,
    )

    parser.add_argument(
        "--rawnet2-checkpoint",
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        default="results/ensemble",
    )

    parser.add_argument(
        "--alpha",
        type=float,
        default=0.5,
        help=(
            "RawNet2 ensemble weight. "
            "AASIST weight = 1-alpha."
        ),
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
    )

    parser.add_argument(
        "--device",
        choices=[
            "cpu",
            "cuda",
        ],
        default=None,
    )

    args = parser.parse_args()

    if not 0.0 <= args.alpha <= 1.0:
        raise ValueError(
            "--alpha must be in [0,1]"
        )

    repo_root = Path(
        __file__
    ).resolve().parents[1]

    test_dir = (
        repo_root
        / args.test_dir
    )

    aasist_checkpoint = (
        repo_root
        / args.aasist_checkpoint
    )

    rawnet2_checkpoint = (
        repo_root
        / args.rawnet2_checkpoint
    )

    output_dir = (
        repo_root
        / args.output_dir
    )

    if args.device:
        device = torch.device(
            args.device
        )
    else:
        device = torch.device(
            "cuda"
            if torch.cuda.is_available()
            else "cpu"
        )

    print()
    print("=" * 60)
    print("HackGT Hearsay Ensemble Scoring")
    print("=" * 60)
    print(f"Device: {device}")
    print(f"Test directory: {test_dir}")
    print(f"AASIST checkpoint: {aasist_checkpoint}")
    print(f"RawNet2 checkpoint: {rawnet2_checkpoint}")
    print(f"RawNet2 weight: {args.alpha}")
    print(f"AASIST weight: {1.0 - args.alpha}")
    print()

    files = sorted(
        test_dir.glob("*.wav")
    )

    if not files:
        raise RuntimeError(
            f"No WAV files found in {test_dir}"
        )

    print(
        f"Found {len(files)} WAV files"
    )

    # --------------------------------------------------------
    # AASIST
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("LOADING AASIST")
    print("=" * 60)

    aasist = load_aasist(
        aasist_checkpoint,
        device,
        repo_root,
    )

    print("Scoring AASIST...")

    aasist_scores = score_aasist(
        aasist,
        files,
        device,
        args.batch_size,
    )

    aasist_output = (
        output_dir
        / "aasist_scores.tsv"
    )

    write_scores(
        aasist_scores,
        aasist_output,
    )

    print(
        f"Saved: {aasist_output}"
    )

    # Free GPU memory before loading second model
    del aasist

    if device.type == "cuda":
        torch.cuda.empty_cache()

    # --------------------------------------------------------
    # RAWNET2
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("LOADING RAWNET2")
    print("=" * 60)

    rawnet2 = load_rawnet2(
        rawnet2_checkpoint,
        device,
        repo_root,
    )

    print("Scoring RawNet2...")

    rawnet2_scores = score_rawnet2(
        rawnet2,
        files,
        device,
        args.batch_size,
    )

    rawnet2_output = (
        output_dir
        / "rawnet2_scores.tsv"
    )

    write_scores(
        rawnet2_scores,
        rawnet2_output,
    )

    print(
        f"Saved: {rawnet2_output}"
    )

    del rawnet2

    if device.type == "cuda":
        torch.cuda.empty_cache()

    # --------------------------------------------------------
    # ENSEMBLE
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("CREATING ENSEMBLE")
    print("=" * 60)

    combined_scores = ensemble_scores(
        aasist_scores,
        rawnet2_scores,
        args.alpha,
    )

    ensemble_output = (
        output_dir
        / "ensemble_scores.tsv"
    )

    write_scores(
        combined_scores,
        ensemble_output,
    )

    print(
        f"Saved: {ensemble_output}"
    )

    # --------------------------------------------------------
    # FINAL SANITY CHECK
    # --------------------------------------------------------

    expected = len(files)

    assert (
        len(aasist_scores)
        == expected
    )

    assert (
        len(rawnet2_scores)
        == expected
    )

    assert (
        len(combined_scores)
        == expected
    )

    print()
    print("=" * 60)
    print("COMPLETE")
    print("=" * 60)

    print(
        f"Files scored: {expected}"
    )

    print()
    print("Outputs:")

    print(
        f"  AASIST:   {aasist_output}"
    )

    print(
        f"  RawNet2:  {rawnet2_output}"
    )

    print(
        f"  Ensemble: {ensemble_output}"
    )


if __name__ == "__main__":
    main()