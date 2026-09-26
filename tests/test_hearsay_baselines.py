"""Fast contract tests plus opt-in real baseline forward/backward tests."""
import csv
import os
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
import torch

from src.audio.waveform import crop_or_repeat, load_waveform
from src.hearsay.data import (ROOT, build_split, discover, read_manifest, validate_pair,
                              write_manifest)
from src.hearsay.runtime import (checked_logits, choose_device, continuous_scores, datasets,
                                 digest, evaluate_scores, model_factory, save_json, seed_all, write_scores)


@pytest.fixture
def manifests(tmp_path):
    real, fake = tmp_path / "real", tmp_path / "fake/nested/generator"
    real.mkdir()
    fake.mkdir(parents=True)
    for directory in [real, fake]:
        for i in range(5):
            sf.write(directory / f"{i}.wav", np.linspace(-0.2, 0.2, 1800, dtype=np.float32), 16000)
        sf.write(directory / "extra.flac", np.zeros(1600), 16000)
    train, dev = build_split(real, tmp_path / "fake", seed=1234)
    tr, dv = tmp_path / "train.csv", tmp_path / "dev.csv"
    write_manifest(tr, train)
    write_manifest(dv, dev)
    return real, tmp_path / "fake", tr, dv


def test_manifest_contract(manifests):
    real, fake, tr, dv = manifests
    first = build_split(real, fake)
    assert first == build_split(real, fake)
    assert first != build_split(real, fake, seed=42)
    train, dev = read_manifest(tr), read_manifest(dv)
    validate_pair(train, dev)
    assert len(train) + len(dev) == 12
    assert all((r["label"], r["class_name"]) in [(1, "bonafide"), (0, "spoof")] for r in train + dev)
    assert len(discover(fake)) == 6
    with pytest.raises(ValueError, match="overlap"):
        validate_pair(train, train)
    with pytest.raises(ValueError, match="Duplicate"):
        build_split(real, real)


def test_empty_class_and_test_leakage(manifests, tmp_path):
    real, fake, tr, dv = manifests
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError):
        build_split(real, empty)
    forbidden = tmp_path / "HackGTHearsayTesting"
    forbidden.mkdir()
    sf.write(forbidden / "test.wav", np.zeros(1000), 16000)
    with pytest.raises(ValueError, match="Final test"):
        build_split(real, forbidden)
    rows = read_manifest(tr)
    rows[0]["label"] = 1 - rows[0]["label"]
    write_manifest(tr, rows)
    with pytest.raises(ValueError, match="Invalid label"):
        read_manifest(tr)


@pytest.mark.parametrize("rate,channels", [(16000, 1), (22050, 2), (48000, 4)])
def test_waveform_resample(tmp_path, rate, channels):
    path = tmp_path / "audio.wav"
    sf.write(path, np.full((rate // 10, channels), 0.1), rate, subtype="FLOAT")
    waveform = load_waveform(path)
    assert waveform.dtype == torch.float32 and waveform.shape == (1600,)
    assert torch.isfinite(waveform).all()
    assert abs(waveform[100:-100].mean().item() - 0.1) < 1e-4


@pytest.mark.parametrize("samples", [np.array([]), np.zeros(1), np.array([float('nan')] * 1600), np.array([float('inf')] * 1600)])
def test_invalid_waveform(tmp_path, samples):
    path = tmp_path / "bad.wav"
    sf.write(path, samples, 16000, subtype="FLOAT")
    with pytest.raises(ValueError, match="Cannot load audio"):
        load_waveform(path)


def test_corrupt_waveform(tmp_path):
    path = tmp_path / "bad.wav"
    path.write_text("not audio")
    with pytest.raises(ValueError, match="Cannot load audio"):
        load_waveform(path)


def test_crop_boundaries():
    assert torch.equal(crop_or_repeat(torch.arange(4), 4, True), torch.arange(4))
    assert torch.equal(crop_or_repeat(torch.arange(2), 5), torch.tensor([0, 1, 0, 1, 0]))
    assert torch.equal(crop_or_repeat(torch.arange(10), 4), torch.arange(4))
    seed_all(1)
    crops = [crop_or_repeat(torch.arange(5), 4, True).tolist() for _ in range(20)]
    assert [0, 1, 2, 3] in crops and [1, 2, 3, 4] in crops


@pytest.mark.parametrize("name,length", [("aasist", 64600), ("rawnet2", 64000)])
def test_datasets(manifests, name, length):
    _, _, tr, dv = manifests
    train, dev = datasets(name, tr, dv)
    for ds in [train, dev]:
        x, label = ds[0]
        assert x.shape == (length,) and label in {0, 1} and torch.isfinite(x).all()
    assert torch.equal(dev[0][0], dev[0][0])


def test_score_contract_and_official_metrics(manifests, tmp_path):
    rows = read_manifest(manifests[3])
    path = tmp_path / "scores.tsv"
    scores = [2.0 if r["label"] else -2.0 for r in rows]
    write_scores(path, rows, scores)
    result = evaluate_scores(path, rows, "aasist", tmp_path / "metrics.json")
    assert result["EER"] == 0 and result["minDCF"] == 0 and np.isfinite(result["CLLR"])
    with path.open() as stream:
        assert len(list(csv.DictReader(stream, delimiter="\t"))) == len(rows)
    with pytest.raises(ValueError):
        write_scores(path, rows, [float("nan")] * len(rows))
    with pytest.raises(ValueError):
        write_scores(path, rows, scores[:-1])
    with pytest.raises(ValueError):
        write_scores(path, rows + rows, scores + scores)
    with pytest.raises(ValueError):
        evaluate_scores(path, rows[::-1], "aasist", tmp_path / "bad.json")
    logits = torch.tensor([[0.1, 0.4], [0.8, -0.2]])
    assert torch.equal(continuous_scores("aasist", logits), logits[:, 1])
    assert torch.equal(continuous_scores("rawnet2", logits), logits.softmax(1)[:, 1])


def test_no_silent_cpu_fallback(monkeypatch):
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    with pytest.raises(RuntimeError, match="requires CUDA"):
        choose_device("aasist", "auto")
    with pytest.raises(RuntimeError, match="no CPU fallback"):
        choose_device("rawnet2", "cuda")


def test_unlabeled_manifest_and_scores(manifests, tmp_path):
    from src.hearsay.data import ManifestDataset
    rows = [{"path": row["path"]} for row in read_manifest(manifests[3])]
    manifest = tmp_path / "unlabeled.csv"
    write_manifest(manifest, rows, fields=["path"])
    dataset = ManifestDataset(manifest, 64000, labeled=False)
    assert dataset[0][0].shape == (64000,) and dataset[0][1] == rows[0]["path"]
    output = tmp_path / "test_scores.tsv"
    write_scores(output, rows, [0.125] * len(rows), labeled=False)
    with output.open() as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        assert reader.fieldnames == ["filename", "score"]
        assert [r["filename"] for r in reader] == [r["path"] for r in rows]


def test_inference_gate_rejects_changed_artifacts(tmp_path):
    from scripts.infer_baselines import verification_records
    for name in ["aasist", "rawnet2"]:
        folder = tmp_path / name
        folder.mkdir()
        checkpoint = folder / "checkpoint.pt"
        checkpoint.write_bytes(b"fixture, not a real checkpoint")
        scores = folder / "dev_scores.tsv"
        scores.write_text("fixture")
        save_json(folder / "verification.json", dict(status="VERIFIED", checkpoint=str(checkpoint),
                  checkpoint_sha256=digest(checkpoint), dev_scores_sha256=digest(scores),
                  waveform_loader_sha256=digest(ROOT / "src/audio/waveform.py"),
                  train_manifest_sha256="same-train", dev_manifest_sha256="same-dev"))
    assert len(verification_records(tmp_path)) == 2
    (tmp_path / "rawnet2/dev_scores.tsv").write_text("modified")
    with pytest.raises(ValueError, match="Changed verification artifact"):
        verification_records(tmp_path)


def test_real_repository_audio():
    tr = ROOT / "data/hearsay/train_manifest.csv"
    dv = ROOT / "data/hearsay/dev_manifest.csv"
    if not tr.exists() or not dv.exists():
        pytest.skip("Build real HackGT manifests first")
    rows = read_manifest(tr)
    validate_pair(rows, read_manifest(dv))
    for label in [0, 1]:
        selected = [r for r in rows if r["label"] == label][:3]
        assert len(selected) == 3
        for row in selected:
            waveform = load_waveform(ROOT / row["path"])
            assert waveform.numel() and torch.isfinite(waveform).all()


@pytest.mark.parametrize("name,length", [("aasist", 64600), ("rawnet2", 64000)])
def test_supplied_model_forward_backward(name, length):
    if os.environ.get("HEARSAY_MODEL_TESTS") != "1":
        pytest.skip("Set HEARSAY_MODEL_TESTS=1 for supplied-model CPU forward/backward tests")
    seed_all(1234)
    model = model_factory(name, torch.device("cpu"))
    logits = checked_logits(model, torch.randn(2, length) * 0.1)
    assert logits.shape == (2, 2)
    loss = torch.nn.functional.cross_entropy(logits, torch.tensor([0, 1]))
    loss.backward()
    assert torch.isfinite(loss)
    assert any(p.grad is not None for p in model.parameters())
    assert all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None)
