"""WavLM encoder with masked mean pooling and a binary classification head."""
import math
import torch
from torch import nn
from transformers import WavLMConfig, WavLMModel
from src.audio.waveform import load_waveform

SAMPLE_RATE = 16000


def clip_sample_count(seconds):
    if not math.isfinite(seconds) or seconds < 0.025:
        raise ValueError("clip_seconds must be finite and at least 0.025")
    return int(seconds * SAMPLE_RATE)


def prepare_clip(waveform, size):
    """Normalize valid samples before padding; shared by training and inference."""
    clip = waveform[:size]
    length = clip.numel()
    if length == 0:
        raise ValueError("Cannot prepare an empty clip")
    clip = (clip - clip.mean()) / torch.sqrt(clip.var(unbiased=False) + 1e-7)
    # Extremely short final chunks need one receptive field of valid input.
    valid_length = max(400, length)
    values = torch.zeros(size, dtype=clip.dtype)
    values[:length] = clip
    mask = torch.arange(size) < valid_length
    return values, mask.long()


class SyntheticSpeechDetector(nn.Module):
    def __init__(self, model_name="microsoft/wavlm-base-plus", encoder_config=None):
        super().__init__()
        self.encoder = (WavLMModel.from_pretrained(model_name)
                        if encoder_config is None else WavLMModel(WavLMConfig(**encoder_config)))
        self.classifier = nn.Sequential(nn.Linear(self.encoder.config.hidden_size, 256),
                                        nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 1))
        self.encoder_frozen = False

    def freeze_encoder(self):
        self.encoder_frozen = True
        self.encoder.requires_grad_(False)
        self.encoder.eval()

    def train(self, mode=True):
        super().train(mode)
        if self.encoder_frozen:
            self.encoder.eval()
        return self

    def forward(self, input_values, attention_mask=None):
        hidden = self.encoder(input_values=input_values,
                              attention_mask=attention_mask).last_hidden_state
        if attention_mask is None:
            pooled = hidden.mean(dim=1)
        else:
            mask = self.encoder._get_feature_vector_attention_mask(hidden.shape[1], attention_mask)
            mask = mask.unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp_min(1)
        return self.classifier(pooled).squeeze(-1)
