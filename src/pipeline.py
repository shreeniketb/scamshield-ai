"""Run with: python -m part_b.pipeline incoming_call.mp3"""
import argparse
import json
from audio.normalize import normalize_audio
from transcription.transcribe import Transcriber


class PartBPipeline:
    def __init__(self, synthetic_model_path=None, device="cpu", model_name="small.en",
                 output_dir="work/normalized"):
        self.synthetic_detector = None
        if synthetic_model_path is not None:
            from synthetic_detection.inference import SyntheticDetector
            self.synthetic_detector = SyntheticDetector(synthetic_model_path, device=device)
        self.transcriber = Transcriber(model_name=model_name, device=device)
        self.output_dir = output_dir

    def analyze(self, input_path: str) -> dict:
        normalized = normalize_audio(input_path, self.output_dir)
        transcript = self.transcriber.transcribe(normalized["path"])
        score = (self.synthetic_detector.predict(normalized["path"])
                 if self.synthetic_detector is not None else None)
        return {"audio": normalized,
                "audio_forensics": {"synthetic_probability": score},
                "transcript": transcript["segments"],
                "language": transcript["language"],
                "language_probability": transcript["language_probability"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio_path")
    parser.add_argument("--weights", default=None)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--whisper-model", default="small.en")
    parser.add_argument("--output-dir", default="work/normalized")
    args = parser.parse_args()
    pipeline = PartBPipeline(args.weights, args.device, args.whisper_model, args.output_dir)
    print(json.dumps(pipeline.analyze(args.audio_path), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
