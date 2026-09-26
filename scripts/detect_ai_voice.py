import argparse
import json
from pathlib import Path

from ai_voice_detector import AIVoiceDetector


def main():
    parser = argparse.ArgumentParser(
        description="Detect AI-generated speech using AASIST."
    )

    parser.add_argument(
        "audio",
        type=Path,
        help="Audio file to analyze.",
    )

    parser.add_argument(
        "--device",
        default=None,
        help="cpu, cuda, or omit for automatic selection.",
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
    )

    args = parser.parse_args()

    detector = AIVoiceDetector(
        device=args.device,
        ai_threshold=args.threshold,
    )

    result = detector.predict(args.audio)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()