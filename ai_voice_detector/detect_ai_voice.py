import argparse
import json
from pathlib import Path

from ai_voice_detector.detector import AIVoiceDetector


def main():
    parser = argparse.ArgumentParser(
        description="Detect AI-generated speech using AASIST."
    )

    parser.add_argument(
        "audio",
        type=Path,
        help="Path to input audio file",
    )

    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("models/aasist_epoch_8.pt"),
    )

    parser.add_argument(
        "--device",
        default=None,
        help="cpu, cuda, or leave unset for automatic selection",
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
    )

    args = parser.parse_args()

    detector = AIVoiceDetector(
        checkpoint_path=args.checkpoint,
        device=args.device,
        ai_threshold=args.threshold,
    )

    result = detector.predict(args.audio)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()