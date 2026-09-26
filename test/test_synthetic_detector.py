from src.synthetic_detection.model import load_waveform 


from pathlib import Path 

folder_path = Path(
    "data/DiffSSD/DiffSSD/generated_speech/openvoicev2/speaker_7995"
)

files = [
    f for f in folder_path.iterdir()
    if f.is_file() and f.suffix.lower() == ".wav"
]

for file in files: 
    val = load_waveform(file) 
    print(val)