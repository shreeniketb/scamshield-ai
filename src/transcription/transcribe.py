"""Whisper transcription with VAD and word timestamps."""
from pathlib import Path


class Transcriber:
    def __init__(self, model_name: str = "small.en", device: str = "cpu"):
        from faster_whisper import WhisperModel
        if device not in {"cpu", "cuda"}:
            raise ValueError("device must be 'cpu' or 'cuda'")
        self.model = WhisperModel(model_name, device=device,
                                  compute_type="float16" if device == "cuda" else "int8")

    def transcribe(self, audio_path: str) -> dict:
        if not Path(audio_path).is_file():
            raise FileNotFoundError(audio_path)
        segments, info = self.model.transcribe(str(audio_path), language="en",
                                              vad_filter=True, word_timestamps=True,
                                              beam_size=5)
        # Consuming the generator actually performs transcription.
        result = [{"start": float(segment.start), "end": float(segment.end),
                   "text": segment.text.strip(),
                   "words": [{"start": float(word.start), "end": float(word.end),
                              "word": word.word, "probability": float(word.probability)}
                             for word in (segment.words or [])]}
                  for segment in segments]
        return {"language": info.language,
                "language_probability": float(info.language_probability),
                "segments": result}
