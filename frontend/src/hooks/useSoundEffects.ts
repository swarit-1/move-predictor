import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";

/**
 * Generates chess move sounds using Web Audio API.
 * Plays different tones for moves, captures, checks, and game-over.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

function playMoveSound() {
  playTone(600, 0.08, "sine", 0.12);
}

function playCaptureSound() {
  playTone(300, 0.12, "square", 0.1);
  setTimeout(() => playTone(200, 0.08, "square", 0.08), 40);
}

function playCheckSound() {
  playTone(800, 0.06, "sine", 0.15);
  setTimeout(() => playTone(1000, 0.1, "sine", 0.1), 60);
}

function playCastleSound() {
  playTone(500, 0.06, "sine", 0.1);
  setTimeout(() => playTone(600, 0.06, "sine", 0.1), 80);
}

function playGameOverSound() {
  playTone(400, 0.15, "sine", 0.12);
  setTimeout(() => playTone(300, 0.15, "sine", 0.1), 150);
  setTimeout(() => playTone(200, 0.3, "sine", 0.08), 300);
}

export function useSoundEffects() {
  const chess = useGameStore((s) => s.chess);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const prevLenRef = useRef(moveHistory.length);

  useEffect(() => {
    const currLen = moveHistory.length;
    if (currLen <= prevLenRef.current) {
      prevLenRef.current = currLen;
      return;
    }
    prevLenRef.current = currLen;

    // Check what the last move was
    const history = chess.history({ verbose: true });
    if (history.length === 0) return;

    const lastMove = history[history.length - 1];

    if (chess.isGameOver()) {
      playGameOverSound();
    } else if (chess.inCheck()) {
      playCheckSound();
    } else if (lastMove.flags.includes("k") || lastMove.flags.includes("q")) {
      playCastleSound();
    } else if (lastMove.captured) {
      playCaptureSound();
    } else {
      playMoveSound();
    }
  }, [moveHistory.length, chess]);
}
