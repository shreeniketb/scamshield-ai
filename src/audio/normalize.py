"""Convert supported audio formats to mono, 16 kHz, signed 16-bit WAV."""
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4
import wave

TARGET_SAMPLE_RATE = 16000


def normalize_audio(input_path: str, output_dir: str = "work/normalized") -> dict:
    source = Path(input_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("Install FFmpeg and add its bin directory to PATH.")
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    # Each run gets its own directory to avoid collisions and overwriting inputs.
    run_directory = directory / f"audio_{uuid4().hex}"
    run_directory.mkdir()
    destination = run_directory / f"{source.stem}_16khz.wav"
    command = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
               "-y", "-i", str(source), "-map", "0:a:0", "-vn",
               "-ac", "1", "-ar", str(TARGET_SAMPLE_RATE),
               "-af", "loudnorm", "-c:a", "pcm_s16le", str(destination)]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        with wave.open(str(destination), "rb") as audio:
            if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (16000, 1, 2):
                raise ValueError("FFmpeg produced an unexpected audio format.")
            if audio.getnframes() == 0:
                raise ValueError("Input contains no audio samples.")
            return {"path": str(destination), "sample_rate": audio.getframerate(),
                    "channels": audio.getnchannels(),
                    "duration": audio.getnframes() / audio.getframerate()}
    except Exception as error:
        destination.unlink(missing_ok=True)
        destination.parent.rmdir()
        if isinstance(error, subprocess.CalledProcessError):
            raise RuntimeError(f"FFmpeg conversion failed: {error.stderr.strip()}") from error
        raise
