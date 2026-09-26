from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio


TARGET_SR = 16_000
AASIST_LENGTH = 64_600


def load_audio(path: str | Path) -> torch.Tensor:
    """
    Load an audio file and return a mono float32 waveform at 16 kHz.

    Returns
    -------
    waveform : torch.Tensor
        Shape [num_samples].
    """
    path = Path(path)

    waveform, sample_rate = sf.read(path, always_2d=True)

    # [samples, channels] -> mono
    waveform = waveform.mean(axis=1).astype(np.float32)

    waveform = torch.from_numpy(waveform)

    if sample_rate != TARGET_SR:
        waveform = torchaudio.functional.resample(
            waveform,
            orig_freq=sample_rate,
            new_freq=TARGET_SR,
        )

    # Avoid pathological amplitudes.
    peak = waveform.abs().max()

    if peak > 0:
        waveform = waveform / peak

    return waveform


def repeat_or_crop(
    waveform: torch.Tensor,
    length: int = AASIST_LENGTH,
) -> torch.Tensor:
    """
    Match AASIST's required input length.

    Short audio is repeated.
    Long audio is cropped.
    """
    n = waveform.numel()

    if n == 0:
        raise ValueError("Audio file contains no samples")

    if n < length:
        repeats = (length + n - 1) // n
        waveform = waveform.repeat(repeats)

    return waveform[:length]