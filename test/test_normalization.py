from pathlib import Path
import wave

from src.audio import normalize_audio


folder_path = Path(
    "data/DiffSSD/DiffSSD/generated_speech/openvoicev2/speaker_7995"
)

files = [f for f in folder_path.iterdir() if f.is_file()]


for file in files:
    print(f"\nTesting: {file}")

    result = normalize_audio(file)

    print("Result:", result)

    output_path = Path(result["path"])

    assert output_path.exists()
    assert result["sample_rate"] == 16000
    assert result["channels"] == 1
    assert result["duration"] > 0

    with wave.open(str(output_path), "rb") as audio:
        assert audio.getframerate() == 16000
        assert audio.getnchannels() == 1
        assert audio.getsampwidth() == 2
        assert audio.getnframes() > 0

    print("PASS")


print("\nAll 3 files passed.")