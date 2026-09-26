from pathlib import Path

from src.transcription import Transcriber


folder_path = Path(
    "data/DiffSSD/DiffSSD/generated_speech/openvoicev2/speaker_7995"
)

files = [
    f for f in folder_path.iterdir()
    if f.is_file() and f.suffix.lower() == ".wav"
]

assert len(files) >= 3, "Need at least 3 WAV files for this test"

print(f"Found {len(files)} WAV files")

# Load model once, not once per file
transcriber = Transcriber(
    model_name="small.en",
    device="cpu"
)

for file in files[:3]:
    print("\n" + "=" * 70)
    print(f"Testing: {file}")

    result = transcriber.transcribe(str(file))

    print("Language:", result["language"])
    print("Language probability:", result["language_probability"])

    # Basic structure checks
    assert "language" in result
    assert "language_probability" in result
    assert "segments" in result

    assert isinstance(result["language"], str)
    assert isinstance(result["language_probability"], float)
    assert isinstance(result["segments"], list)

    assert 0.0 <= result["language_probability"] <= 1.0

    # We expect these speech samples to contain transcription output
    assert len(result["segments"]) > 0

    print("\nTranscription:")

    full_text = []

    for segment in result["segments"]:
        assert "start" in segment
        assert "end" in segment
        assert "text" in segment
        assert "words" in segment

        assert isinstance(segment["start"], float)
        assert isinstance(segment["end"], float)
        assert isinstance(segment["text"], str)
        assert isinstance(segment["words"], list)

        assert segment["start"] >= 0
        assert segment["end"] >= segment["start"]

        print(
            f"[{segment['start']:.2f} -> {segment['end']:.2f}] "
            f"{segment['text']}"
        )

        full_text.append(segment["text"])

        for word in segment["words"]:
            assert "start" in word
            assert "end" in word
            assert "word" in word
            assert "probability" in word

            assert isinstance(word["start"], float)
            assert isinstance(word["end"], float)
            assert isinstance(word["word"], str)
            assert isinstance(word["probability"], float)

            assert word["start"] >= 0
            assert word["end"] >= word["start"]
            assert 0.0 <= word["probability"] <= 1.0

    transcription = " ".join(full_text).strip()

    assert transcription != ""

    print("\nFull text:")
    print(transcription)

    print("\nPASS")


# Test missing-file behavior
try:
    transcriber.transcribe("this_file_does_not_exist.wav")
    raise AssertionError("Expected FileNotFoundError")
except FileNotFoundError:
    print("\nMissing-file test: PASS")


print("\nAll transcription tests passed.")