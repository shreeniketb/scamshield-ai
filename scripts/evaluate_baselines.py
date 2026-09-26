import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.hearsay.data import read_manifest
from src.hearsay.runtime import evaluate_scores

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["aasist", "rawnet2"], required=True)
    parser.add_argument("--scores", required=True)
    parser.add_argument("--dev-manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(evaluate_scores(args.scores, read_manifest(args.dev_manifest), args.model, args.output))
