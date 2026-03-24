"""Board Encoder: 15-block ResNet with 256 channels.

Takes an 18-channel 8×8 board tensor and produces a 256-dim feature vector.
Architecture follows AlphaZero/Maia: initial convolution followed by residual
blocks, then global average pooling.
"""

import torch
import torch.nn as nn

from src.config import settings


class ResidualBlock(nn.Module):
    """Standard residual block: Conv→BN→ReLU→Conv→BN + skip → ReLU."""

    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = out + residual
        out = self.relu(out)
        return out


class BoardEncoder(nn.Module):
    """ResNet-based board encoder.

    Input:  (B, 18, 8, 8) — 18-channel board tensor
    Output: (B, 256) — board feature vector
    """

    def __init__(
        self,
        in_channels: int = settings.board_channels,
        num_blocks: int = settings.resnet_blocks,
        channels: int = settings.resnet_channels,
    ):
        super().__init__()

        # Initial convolution to project input channels to internal channels
        self.input_conv = nn.Sequential(
            nn.Conv2d(in_channels, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
        )

        # Residual tower
        self.blocks = nn.Sequential(
            *[ResidualBlock(channels) for _ in range(num_blocks)]
        )

        # Global average pooling to get a fixed-size vector
        self.pool = nn.AdaptiveAvgPool2d(1)

        self.output_dim = channels

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Board tensor of shape (B, 18, 8, 8).

        Returns:
            Feature vector of shape (B, 256).
        """
        x = self.input_conv(x)
        x = self.blocks(x)
        x = self.pool(x)
        x = x.flatten(1)  # (B, channels)
        return x
