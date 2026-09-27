from datasets import load_dataset, Audio
from pathlib import Path
import subprocess
import tempfile

NUM_SAMPLES = 2000
TARGET_SR = 16000

OUTPUT_DIR = Path("data/CommonVoiceReal")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ds = load_dataset(
    "fixie-ai/common_voice_17_0",
    "en",
    split="train",
    streaming=True,
)

# Critical: disable Hugging Face audio decoding
ds = ds.cast_column("audio", Audio(decode=False))

ds = ds.shuffle(
    seed=1234,
    buffer_size=5000,
)

saved = 0

for sample in ds:
    if saved >= NUM_SAMPLES:
        break

    audio = sample["audio"]

    audio_bytes = audio.get("bytes")
    audio_path = audio.get("path")

    output_path = OUTPUT_DIR / f"commonvoice_{saved:06d}.wav"

    if audio_bytes is not None:
        with tempfile.NamedTemporaryFile(
            suffix=".mp3",
            delete=False,
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel", "error",
                "-i", tmp_path,
                "-ac", "1",
                "-ar", str(TARGET_SR),
                str(output_path),
            ],
            check=True,
        )

        Path(tmp_path).unlink(missing_ok=True)

    elif audio_path is not None:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel", "error",
                "-i", audio_path,
                "-ac", "1",
                "-ar", str(TARGET_SR),
                str(output_path),
            ],
            check=True,
        )

    else:
        print("Skipping sample with no audio")
        continue

    saved += 1

    if saved % 100 == 0:
        print(f"Saved {saved}/{NUM_SAMPLES}")

print(f"Done. Saved {saved} files.")