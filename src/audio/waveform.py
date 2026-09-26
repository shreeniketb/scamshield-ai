"""In-memory baseline audio: mono float32 at 16 kHz; reject invalid inputs."""
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

SAMPLE_RATE = 16000


def load_waveform(path, min_duration=0.025):
    """Shared WavLM/baseline loader; reject audio shorter than 25 ms."""
    try:
        samples, rate = sf.read(Path(path), dtype="float32", always_2d=True)
        if rate <= 0 or len(samples) < max(1, int(rate * min_duration)):
            raise ValueError("empty or shorter than minimum duration")
        if not np.isfinite(samples).all():
            raise ValueError("NaN/Inf audio samples")
        waveform = torch.from_numpy(samples).mean(dim=1)
        if rate != SAMPLE_RATE:
            from torchaudio.functional import resample
            waveform = resample(waveform, rate, SAMPLE_RATE)
        if not waveform.numel() or not torch.isfinite(waveform).all():
            raise ValueError("invalid audio after preprocessing")
        return waveform.contiguous()
    except Exception as exc:
        raise ValueError(f"Cannot load audio {path}: {exc}") from exc


def crop_or_repeat(waveform, length, training=False):
    """Baseline repeat padding; random inclusive crop for train, first crop for dev."""
    if length <= 0 or waveform.ndim != 1 or not waveform.numel():
        raise ValueError("Expected nonempty 1-D waveform and positive target length")
    if waveform.numel() >= length:
        start = int(torch.randint(waveform.numel() - length + 1, ())) if training else 0
        return waveform[start:start + length]
    return waveform.repeat((length + waveform.numel() - 1) // waveform.numel())[:length]
