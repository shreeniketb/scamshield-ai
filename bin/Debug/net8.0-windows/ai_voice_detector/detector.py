from __future__ import annotations

from pathlib import Path

import torch

from .aasist import Model
from .audio import AASIST_LENGTH, load_audio, repeat_or_crop


HERE = Path(__file__).resolve().parent

DEFAULT_CHECKPOINT = HERE / "model" / "aasist_epoch_8.pt"


# Exact AASIST configuration used by the standard 297,866-parameter model.
AASIST_CONFIG = {
    "nb_samp": 64600,
    "first_conv": 128,
    "filts": [
        70,
        [1, 32],
        [32, 32],
        [32, 64],
        [64, 64],
    ],
    "gat_dims": [64, 32],
    "pool_ratios": [0.5, 0.7, 0.5, 0.5],
    "temperatures": [2.0, 2.0, 100.0, 100.0],
}


class AIVoiceDetector:
    """
    Standalone AASIST-based synthetic speech detector.

    Training convention
    -------------------
    class 0 = spoof / AI-generated
    class 1 = bonafide / real

    Note
    ----
    Returned softmax values are model confidence scores.
    They should not be interpreted as statistically calibrated probabilities.
    """

    def __init__(
        self,
        checkpoint_path: str | Path | None = None,
        device: str | None = None,
        ai_threshold: float = 0.5,
    ):
        if checkpoint_path is None:
            checkpoint_path = DEFAULT_CHECKPOINT

        self.checkpoint_path = Path(checkpoint_path)
        self.ai_threshold = ai_threshold

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"

        self.device = torch.device(device)

        if not self.checkpoint_path.exists():
            raise FileNotFoundError(
                f"AASIST checkpoint not found: {self.checkpoint_path}"
            )

        self.model = self._build_model()
        self._load_checkpoint()

        self.model.to(self.device)
        self.model.eval()

    def _build_model(self) -> torch.nn.Module:
        """
        Construct exactly the same AASIST architecture used during training.
        """
        model = Model(AASIST_CONFIG)

        return model

    def _load_checkpoint(self) -> None:
        checkpoint = torch.load(
            self.checkpoint_path,
            map_location=self.device,
            weights_only=True,
        )

        # Your ScamShield training checkpoints contain:
        #
        # {
        #     "model": "aasist",
        #     "state_dict": ...,
        #     ...
        # }

        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:

            checkpoint_model = checkpoint.get("model")

            if checkpoint_model is not None and checkpoint_model != "aasist":
                raise ValueError(
                    "Checkpoint is not an AASIST checkpoint. "
                    f"Found model={checkpoint_model!r}"
                )

            state_dict = checkpoint["state_dict"]

        else:
            # Also support plain state_dict checkpoints.
            state_dict = checkpoint

        self.model.load_state_dict(state_dict, strict=True)

    @torch.inference_mode()
    def predict(
        self,
        audio_path: str | Path,
    ) -> dict:
        """
        Predict whether one audio file is AI-generated or real.
        """

        audio_path = Path(audio_path)

        waveform = load_audio(audio_path)

        waveform = repeat_or_crop(
            waveform,
            AASIST_LENGTH,
        )

        # [64600] -> [1, 64600]
        x = waveform.unsqueeze(0).to(self.device)

        # AASIST returns:
        #
        #     last_hidden, output
        #
        # where output contains the two classification logits.
        _, logits = self.model(x)

        if logits.ndim != 2 or logits.shape != (1, 2):
            raise RuntimeError(
                "Unexpected AASIST output shape. "
                f"Expected (1, 2), got {tuple(logits.shape)}"
            )

        probabilities = torch.softmax(
            logits,
            dim=-1,
        )

        ai_score = float(probabilities[0, 0].item())
        real_score = float(probabilities[0, 1].item())

        prediction = (
            "AI"
            if ai_score >= self.ai_threshold
            else "REAL"
        )

        return {
            "prediction": prediction,
            "ai_probability": ai_score,
            "real_probability": real_score,
            "threshold": self.ai_threshold,
            "model": "AASIST",
            "audio_path": str(audio_path),
        }

    def __call__(
        self,
        audio_path: str | Path,
    ) -> dict:
        return self.predict(audio_path)