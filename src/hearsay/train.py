import argparse
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from src.hearsay.data import ROOT, validate_pair
from src.hearsay.runtime import (checked_logits, choose_device, datasets, digest, environment,
                                 evaluate_scores, model_factory, save_json, score_model, seed_all, write_scores)


def main(name):
    parser = argparse.ArgumentParser(description=f"HackGT {name}; real=1 fake=0")
    parser.add_argument("--train-manifest", type=Path, default=ROOT / "data/hearsay/train_manifest.csv")
    parser.add_argument("--dev-manifest", type=Path, default=ROOT / "data/hearsay/dev_manifest.csv")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--output-dir", type=Path, default=ROOT / f"results/{name}")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--forward-only", action="store_true")
    parser.add_argument("--one-batch", action="store_true", help="Forward/loss/backward only, no optimizer or checkpoint")
    args = parser.parse_args()
    if args.batch_size < 2 or args.epochs < 1 or args.threads < 1:
        parser.error("batch-size >= 2, epochs >= 1 and threads >= 1 required")
    seed_all(args.seed, args.threads)
    device = choose_device(name, args.device)
    train, dev = datasets(name, args.train_manifest, args.dev_manifest)
    validate_pair(train.rows, dev.rows)
    model = model_factory(name, device)
    count = sum(p.numel() for p in model.parameters())
    print(f"Environment: {environment()}\nParameters: {count}", flush=True)
    # Merge a singleton final batch into the previous one; never discard examples.
    generator = torch.Generator().manual_seed(args.seed)
    def batches():
        indices = torch.randperm(len(train), generator=generator).tolist()
        chunks = [indices[i:i + args.batch_size] for i in range(0, len(indices), args.batch_size)]
        if len(chunks) > 1 and len(chunks[-1]) == 1:
            chunks[-2].extend(chunks.pop())
        return chunks
    criterion = torch.nn.CrossEntropyLoss(weight=torch.tensor([0.1, 0.9], device=device))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0001, weight_decay=0.0001)
    started = time.monotonic()
    if args.forward_only or args.one_batch:
        x, y = next(iter(DataLoader(train, batch_sampler=batches(), num_workers=0)))
        model.train(not args.forward_only)
        with torch.set_grad_enabled(not args.forward_only):
            logits = checked_logits(model, x.to(device))
            loss = criterion(logits, y.to(device))
        if not torch.isfinite(loss):
            raise ValueError("Nonfinite loss")
        if args.one_batch and not args.forward_only:
            loss.backward()
            if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in model.parameters()):
                raise ValueError("Nonfinite gradients")
        print(f"PASS: batch_x={list(x.shape)} batch_y={list(y.shape)} logits={list(logits.shape)} "
              f"loss={loss.item():.6f} backward={args.one_batch and not args.forward_only}", flush=True)
        return
    args.output_dir.mkdir(parents=True, exist_ok=True)
    # A failed rerun must not inherit a prior successful verification stamp.
    (args.output_dir / "verification.json").unlink(missing_ok=True)
    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = total = 0
        for step, (x, y) in enumerate(DataLoader(train, batch_sampler=batches(), num_workers=0), 1):
            optimizer.zero_grad(set_to_none=True)
            try:
                loss = criterion(checked_logits(model, x.to(device)), y.to(device))
                if not torch.isfinite(loss):
                    raise ValueError("Nonfinite loss")
                loss.backward()
                if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in model.parameters()):
                    raise ValueError("Nonfinite gradients")
                optimizer.step()
            except torch.cuda.OutOfMemoryError as exc:
                raise RuntimeError("CUDA memory exhausted. Rerun with --batch-size 2; no CPU fallback performed.") from exc
            total_loss += loss.item() * len(y)
            total += len(y)
            if step == 1 or step % 10 == 0:
                print(f"epoch={epoch} batch={step} loss={loss.item():.6f}", flush=True)
        checkpoint = args.output_dir / f"epoch_{epoch}.pt"
        torch.save(dict(model=name, state_dict=model.state_dict(), optimizer=optimizer.state_dict(),
                        epoch=epoch, seed=args.seed, train_manifest_sha256=digest(args.train_manifest),
                        dev_manifest_sha256=digest(args.dev_manifest)), checkpoint)
        scores = score_model(name, model, dev, device, args.batch_size)
        write_scores(args.output_dir / "dev_scores.tsv", dev.rows, scores)
        metrics = evaluate_scores(args.output_dir / "dev_scores.tsv", dev.rows, name, args.output_dir / "dev_metrics.json")
        history.append(dict(epoch=epoch, loss=total_loss / total, **metrics))
        print(history[-1], flush=True)
    record = dict(model=name, status="VERIFIED", device=str(device), environment=environment(),
                  parameter_count=count, train_samples=len(train), dev_samples=len(dev), epochs=args.epochs,
                  checkpoint=str(checkpoint.relative_to(ROOT) if checkpoint.is_relative_to(ROOT) else checkpoint),
                  train_manifest_sha256=digest(args.train_manifest), dev_manifest_sha256=digest(args.dev_manifest),
                  checkpoint_sha256=digest(checkpoint),
                  dev_scores_sha256=digest(args.output_dir / "dev_scores.tsv"),
                  waveform_loader_sha256=digest(ROOT / "src/audio/waveform.py"),
                  elapsed_seconds=time.monotonic() - started, history=history,
                  scope="CPU compatibility smoke" if device.type == "cpu" else "CUDA smoke")
    save_json(args.output_dir / "verification.json", record)
