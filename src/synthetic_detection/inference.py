"""Inference using a checkpoint produced by train.py."""
from pathlib import Path
import torch
from synthetic_detection.model import (
    SyntheticSpeechDetector, clip_sample_count, load_waveform, prepare_clip,
)


class SyntheticDetector:
    def __init__(self, weights_path, device="cpu"):
        if not Path(weights_path).is_file():
            raise FileNotFoundError(f"Train the detector first; missing checkpoint: {weights_path}")
        state = torch.load(weights_path, map_location="cpu", weights_only=True)
        if (state.get("format_version") != 1 or state.get("sample_rate") != 16000
                or state.get("preprocessing") != "valid_mean_variance_v1"
                or state.get("labels") != {"real": 0, "synthetic": 1}):
            raise ValueError("Unsupported checkpoint; use the checkpoint produced by train.py")
        self.clip_samples = clip_sample_count(state["clip_seconds"])
        self.device = torch.device(device)
        # Reconstruct from saved config so inference needs no encoder download.
        self.model = SyntheticSpeechDetector(encoder_config=state["encoder_config"])
        self.model.load_state_dict(state["state_dict"], strict=True)
        self.model.to(self.device).eval()

    @torch.inference_mode()
    def predict(self, audio_path: str) -> float:
        """Duration-weighted mean of non-overlapping window sigmoid scores.

        This baseline score is not a calibrated probability or a fraud verdict.
        """
        waveform = load_waveform(audio_path)
        total_score = 0.0
        for start in range(0, waveform.numel(), self.clip_samples):
            chunk = waveform[start:start + self.clip_samples]
            values, mask = prepare_clip(chunk, self.clip_samples)
            logit = self.model(values.unsqueeze(0).to(self.device), mask.unsqueeze(0).to(self.device))
            total_score += torch.sigmoid(logit).item() * chunk.numel()
        return float(total_score / waveform.numel())
