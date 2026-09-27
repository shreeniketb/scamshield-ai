# AI Voice Detector

Small standalone module for classifying speech audio as **AI-generated** or **real** using AASIST.

Install the required dependencies before running the detector:

```bash
pip install -r ai_voice_detector/requirements.txt
```

## Usage

```python
from ai_voice_detector import AIVoiceDetector

detector = AIVoiceDetector()

result = detector.predict("audio.wav")

print(result)
```

Example output:

```python
{
    "prediction": "AI",
    "ai_probability": 0.9958,
    "real_probability": 0.0042,
    "threshold": 0.5,
    "model": "AASIST",
    "audio_path": "audio.wav"
}
```

## Command Line

```bash
python scripts/detect_ai_voice.py "path/to/audio.wav"
```

Example:

```bash
python scripts/detect_ai_voice.py \
    "data/DiffSSD/generated_speech/pro_diff/sentence_1.wav"
```

## Device

The detector automatically uses CUDA when available and otherwise falls back to CPU.

Force CPU:

```python
detector = AIVoiceDetector(device="cpu")
```

Force CUDA:

```python
detector = AIVoiceDetector(device="cuda")
```

## Custom Threshold

```python
detector = AIVoiceDetector(ai_threshold=0.7)
```

Default threshold:

```text
0.5
```

## Output

```text
prediction        -> AI or REAL
ai_probability    -> AI confidence score
real_probability  -> REAL confidence score
threshold         -> classification threshold
model             -> AASIST
audio_path        -> input file path
```

The bundled checkpoint is loaded automatically from:

```text
ai_voice_detector/model/aasist_epoch_8.pt
```

The returned confidence values are softmax scores and are not calibrated probabilities.
