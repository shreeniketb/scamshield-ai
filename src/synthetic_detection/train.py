"""Train a frozen-WavLM baseline from a path,label,generator CSV manifest."""
import argparse
import csv
from pathlib import Path
import torch
from torch.utils.data import Dataset, DataLoader
from synthetic_detection.model import (
    SyntheticSpeechDetector, clip_sample_count, load_waveform, prepare_clip,
)


class DeepfakeDataset(Dataset):
    def __init__(self, manifest_path, clip_seconds=6, random_crop=True):
        manifest = Path(manifest_path).resolve()
        self.clip_samples = clip_sample_count(clip_seconds)
        self.random_crop = random_crop
        with manifest.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            if not {"path", "label", "generator"}.issubset(reader.fieldnames or []):
                raise ValueError("Manifest requires path,label,generator columns")
            self.rows = list(reader)
        if not self.rows:
            raise ValueError("Manifest is empty")
        for row in self.rows:
            if row["label"] not in {"0", "1"} or not row["path"]:
                raise ValueError("Each row needs a path and label 0 (real) or 1 (synthetic)")
            path = Path(row["path"])
            # Relative paths are resolved against the CSV's directory.
            row["path"] = path if path.is_absolute() else manifest.parent / path
            if not row["path"].is_file():
                raise FileNotFoundError(row["path"])

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        waveform = load_waveform(row["path"])
        excess = waveform.numel() - self.clip_samples
        if excess > 0:
            start = int(torch.randint(excess + 1, ())) if self.random_crop else excess // 2
            waveform = waveform[start:start + self.clip_samples]
        values, mask = prepare_clip(waveform, self.clip_samples)
        return values, mask, torch.tensor(float(row["label"]), dtype=torch.float32)


def train(manifest_path, output_path="models/synthetic_detector.pt", device="cpu",
          epochs=3, batch_size=8, learning_rate=1e-5, clip_seconds=6,
          model_name="microsoft/wavlm-base-plus", fine_tune=False, num_workers=0):
    if epochs < 1 or batch_size < 1 or learning_rate <= 0 or num_workers < 0:
        raise ValueError("Invalid training hyperparameters")
    torch.manual_seed(42)
    dataset = DeepfakeDataset(manifest_path, clip_seconds)
    if {row["label"] for row in dataset.rows} != {"0", "1"}:
        raise ValueError("Training requires both real and synthetic examples")
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    model = SyntheticSpeechDetector(model_name).to(device)
    if not fine_tune:
        model.freeze_encoder()
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad),
                                  lr=learning_rate)
    criterion = torch.nn.BCEWithLogitsLoss()
    history = []
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        for waveform, mask, label in loader:
            waveform, mask, label = waveform.to(device), mask.to(device), label.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(waveform, mask), label)
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite training loss; checkpoint was not saved")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item() * waveform.shape[0]
        history.append(total_loss / len(dataset))
        print(f"epoch={epoch + 1} loss={history[-1]:.4f}")
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"format_version": 1, "model_name": model_name,
                "encoder_config": model.encoder.config.to_dict(),
                "state_dict": {k: v.cpu() for k, v in model.state_dict().items()},
                "sample_rate": 16000, "clip_seconds": clip_seconds,
                "labels": {"real": 0, "synthetic": 1},
                "preprocessing": "valid_mean_variance_v1",
                "epochs": epochs, "loss_history": history}, destination)
    return str(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest")
    parser.add_argument("--output", default="models/synthetic_detector.pt")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--clip-seconds", type=float, default=6)
    parser.add_argument("--model-name", default="microsoft/wavlm-base-plus")
    parser.add_argument("--fine-tune", action="store_true", help="Fine-tune the entire encoder")
    parser.add_argument("--num-workers", type=int, default=0)
    args = parser.parse_args()
    train(args.manifest, args.output, args.device, args.epochs, args.batch_size,
          args.learning_rate, args.clip_seconds, args.model_name, args.fine_tune, args.num_workers)


if __name__ == "__main__":
    main()
