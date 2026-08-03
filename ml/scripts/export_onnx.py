"""Export a bracket checkpoint to ONNX and benchmark CPU inference.

PLAN.md §3.1: production serving must not need a GPU. This script exports
the policy/value/error forward pass to ONNX, verifies numerical parity
against torch, optionally quantizes to int8, and benchmarks batch-1
latency for torch-CPU vs onnxruntime vs onnxruntime-int8.

Usage:
    python3 scripts/export_onnx.py data/checkpoints/1400_1600/phase1_best.pt
    python3 scripts/export_onnx.py <ckpt> --output data/onnx/1400_1600.onnx
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import torch

from src.config import settings
from src.models.move_predictor import MovePredictor


class ExportWrapper(torch.nn.Module):
    """Fixed-signature, tuple-output wrapper around MovePredictor.

    The legal-move mask is applied at inference time by the caller (it is
    cheaper outside the graph), so the export takes only the five model
    inputs and emits raw logits + value + error heads.
    """

    def __init__(self, model: MovePredictor):
        super().__init__()
        self.model = model

    def forward(self, board_tensor, move_history, player_id, player_stats,
                game_phase, time_control):
        out = self.model(
            board_tensor=board_tensor,
            move_history=move_history,
            player_id=player_id,
            player_stats=player_stats,
            game_phase=game_phase,
            time_control=time_control,
        )
        return (
            out["policy_logits"],
            out["value"],
            out["cpl_pred"],
            out["blunder_logit"],
        )


def sample_inputs(batch: int = 1):
    return (
        torch.randn(batch, settings.board_channels, 8, 8),
        torch.randint(0, settings.move_vocab_size, (batch, settings.history_length)),
        torch.zeros(batch, dtype=torch.long),
        torch.randn(batch, settings.num_player_stats),
        torch.ones(batch, dtype=torch.long),
        torch.full((batch,), 2, dtype=torch.long),
    )


def bench(fn, n=50, warmup=5):
    for _ in range(warmup):
        fn()
    t0 = time.perf_counter()
    for _ in range(n):
        fn()
    return (time.perf_counter() - t0) / n * 1000  # ms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--output", default=None)
    parser.add_argument("--skip-int8", action="store_true")
    args = parser.parse_args()

    ckpt_path = Path(args.checkpoint)
    out_path = Path(
        args.output
        or f"data/onnx/{ckpt_path.parent.name or 'model'}.onnx"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.set_num_threads(2)  # match a small prod vCPU allocation
    # The fused nn.TransformerEncoder fast path lowers to
    # aten::_transformer_encoder_layer_fwd, which ONNX can't export.
    # Disabling it traces the decomposed attention ops instead.
    torch.backends.mha.set_fastpath_enabled(False)

    model = MovePredictor()
    ckpt = torch.load(ckpt_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    wrapper = ExportWrapper(model).eval()

    inputs = sample_inputs()
    input_names = [
        "board_tensor", "move_history", "player_id",
        "player_stats", "game_phase", "time_control",
    ]

    print(f"Exporting {ckpt_path} -> {out_path}")
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            inputs,
            str(out_path),
            input_names=input_names,
            output_names=["policy_logits", "value", "cpl_pred", "blunder_logit"],
            dynamic_axes={name: {0: "batch"} for name in input_names},
            opset_version=17,
            dynamo=False,
        )
    size_mb = out_path.stat().st_size / 1e6
    print(f"Exported: {size_mb:.1f} MB")

    import onnxruntime as ort

    sess_opts = ort.SessionOptions()
    sess_opts.intra_op_num_threads = 2
    sess = ort.InferenceSession(str(out_path), sess_opts,
                                providers=["CPUExecutionProvider"])

    feed = {n: t.numpy() for n, t in zip(input_names, inputs)}

    # Parity check
    with torch.no_grad():
        torch_out = wrapper(*inputs)
    ort_out = sess.run(None, feed)
    max_diff = float(np.max(np.abs(torch_out[0].numpy() - ort_out[0])))
    print(f"Parity: max |policy_logits| diff = {max_diff:.2e} "
          f"({'OK' if max_diff < 1e-3 else 'FAIL'})")

    # Benchmarks (batch 1, 2 threads)
    with torch.no_grad():
        t_torch = bench(lambda: wrapper(*inputs))
    t_ort = bench(lambda: sess.run(None, feed))
    print(f"torch-CPU  batch1: {t_torch:6.1f} ms")
    print(f"ORT fp32   batch1: {t_ort:6.1f} ms")

    if not args.skip_int8:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType

            int8_path = out_path.with_suffix(".int8.onnx")
            quantize_dynamic(str(out_path), str(int8_path),
                             weight_type=QuantType.QInt8)
            sess8 = ort.InferenceSession(str(int8_path), sess_opts,
                                         providers=["CPUExecutionProvider"])
            ort8_out = sess8.run(None, feed)
            # int8 shifts logits slightly; check argmax agreement instead
            agree = int(np.argmax(ort8_out[0])) == int(np.argmax(ort_out[0]))
            t_ort8 = bench(lambda: sess8.run(None, feed))
            print(f"ORT int8   batch1: {t_ort8:6.1f} ms "
                  f"({int8_path.stat().st_size / 1e6:.1f} MB, "
                  f"argmax {'agrees' if agree else 'DISAGREES'})")
        except Exception as e:
            print(f"int8 quantization failed (non-fatal): {e}")


if __name__ == "__main__":
    main()
