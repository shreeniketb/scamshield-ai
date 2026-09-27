import argparse
import ast
import csv
import json
import subprocess
import sys
from pathlib import Path


def extract_score(stdout: str) -> float:
    """
    Extract the model's CM score from detect_ai_voice.py output.

    Supports outputs such as:
        {"synthetic_probability": 0.923}
        {"score": 0.923}
        {"probability": 0.923}

    Also supports Python-dict style output using single quotes.
    """

    lines = [line.strip() for line in stdout.splitlines() if line.strip()]

    # Work backwards because the final line is most likely
    # the inference result.
    for line in reversed(lines):

        # Try JSON first
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            obj = None

        # Try Python dictionary syntax
        if obj is None:
            try:
                parsed = ast.literal_eval(line)
                if isinstance(parsed, dict):
                    obj = parsed
            except (ValueError, SyntaxError):
                pass

        if isinstance(obj, dict):
            for key in (
                "synthetic_probability",
                "spoof_probability",
                "cm_score",
                "score",
                "probability",
            ):
                if key in obj:
                    return float(obj[key])

    raise RuntimeError(
        "Could not extract model score from detector output:\n"
        + stdout
    )


def score_audio(
    detector_script: Path,
    audio_path: Path,
    checkpoint: Path,
    device: str | None,
) -> float:

    command = [
        sys.executable,
        str(detector_script),
        str(audio_path),
        "--checkpoint",
        str(checkpoint),
    ]

    if device:
        command.extend(["--device", device])

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Detector failed for {audio_path.name}\n"
            f"STDOUT:\n{result.stdout}\n"
            f"STDERR:\n{result.stderr}"
        )

    return extract_score(result.stdout)


def main():

    parser = argparse.ArgumentParser(
        description="Generate HackGT Hearsay CM-score submission file."
    )

    parser.add_argument(
        "--test-dir",
        required=True,
        help="Directory containing HackGTHearsayTesting WAV files",
    )

    parser.add_argument(
        "--checkpoint",
        required=True,
        help="Model checkpoint",
    )

    parser.add_argument(
        "--output",
        required=True,
        help="Output TSV submission file",
    )

    parser.add_argument(
        "--detector",
        default="ai_voice_detector/detect_ai_voice.py",
        help="Path to detect_ai_voice.py",
    )

    parser.add_argument(
        "--device",
        default=None,
        choices=["cpu", "cuda"],
        help="Inference device",
    )

    parser.add_argument(
        "--invert-score",
        action="store_true",
        help="Write 1 - score instead of score",
    )

    args = parser.parse_args()

    test_dir = Path(args.test_dir)
    checkpoint = Path(args.checkpoint)
    detector = Path(args.detector)
    output = Path(args.output)

    if not test_dir.exists():
        raise FileNotFoundError(
            f"Test directory not found: {test_dir}"
        )

    if not checkpoint.exists():
        raise FileNotFoundError(
            f"Checkpoint not found: {checkpoint}"
        )

    if not detector.exists():
        raise FileNotFoundError(
            f"Detector script not found: {detector}"
        )

    wav_files = sorted(test_dir.glob("*.wav"))

    if not wav_files:
        raise RuntimeError(
            f"No WAV files found in {test_dir}"
        )

    print(f"Found {len(wav_files)} test files")
    print(f"Checkpoint: {checkpoint}")
    print(f"Output: {output}")
    print()

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as f:

        writer = csv.writer(
            f,
            delimiter="\t",
        )

        writer.writerow(
            ["filename", "cm-score"]
        )

        for index, audio_path in enumerate(
            wav_files,
            start=1,
        ):

            try:

                score = score_audio(
                    detector_script=detector,
                    audio_path=audio_path,
                    checkpoint=checkpoint,
                    device=args.device,
                )

                if args.invert_score:
                    score = 1.0 - score

                writer.writerow(
                    [
                        audio_path.name,
                        f"{score:.10f}",
                    ]
                )

                f.flush()

                print(
                    f"[{index}/{len(wav_files)}] "
                    f"{audio_path.name}: {score:.6f}"
                )

            except Exception as e:

                print(
                    f"\nERROR processing {audio_path.name}",
                    file=sys.stderr,
                )

                raise e

    print()
    print("=" * 60)
    print("SCORING COMPLETE")
    print(f"Files scored: {len(wav_files)}")
    print(f"Submission: {output}")
    print("=" * 60)


if __name__ == "__main__":
    main()