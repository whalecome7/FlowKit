import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { BASE_CELL_DP, paletteForSeed } from '../constants';
import MazeSvg from '../components/MazeSvg';
import HudBar from '../components/HudBar';
import { generateMaze } from '../services/generator';
import { loadBest } from '../services/storage';
import { useMazeStore } from '../store';
import type { MazeDifficulty } from '../types';

function randSeed(): number {
  return 1000000 + Math.floor(Math.random() * 9000000);
}

function fmtTime(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export default function MazeGameScreen() {
  const difficulty = useMazeStore((s) => s.difficulty);
  const seed = useMazeStore((s) => s.seed);
  const steps = useMazeStore((s) => s.steps);
  const phase = useMazeStore((s) => s.phase);
  const elapsedMs = useMazeStore((s) => s.elapsedMs);
  const best = useMazeStore((s) => s.best);
  const startedAt = useMazeStore((s) => s.startedAt);
  const setDifficulty = useMazeStore((s) => s.setDifficulty);
  const setSeed = useMazeStore((s) => s.setSeed);
  const resetGame = useMazeStore((s) => s.resetGame);
  const setBest = useMazeStore((s) => s.setBest);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [resetToken, setResetToken] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const maze = useMemo(() => generateMaze(seed, difficulty), [seed, difficulty]);
  const palette = useMemo(() => paletteForSeed(seed), [seed]);

  useEffect(() => {
    loadBest().then(setBest);
  }, [setBest]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick((v) => v + 1), 100);
    return () => clearInterval(timer);
  }, []);

  const timeText =
    phase === 'won'
      ? fmtTime(elapsedMs)
      : startedAt > 0
        ? fmtTime(Date.now() - startedAt)
        : '00:00.0';
  const bestText = best[difficulty] ? fmtTime(best[difficulty]!.timeMs) : '--';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
  };

  // 初始镜头：小迷宫全览、大迷宫按基础尺寸（游戏循环接管后由引擎直写）
  const fit =
    viewport.width > 0 ? Math.min(viewport.width, viewport.height) / (maze.G + 1.6) : 12;
  const scale = Math.max(fit, 10) / BASE_CELL_DP;

  const offsetX = viewport.width / 2 - (maze.G / 2) * BASE_CELL_DP * scale;
  const offsetY = viewport.height / 2 - (maze.G / 2) * BASE_CELL_DP * scale;

  const pickDifficulty = (d: MazeDifficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setSeed(randSeed());
    resetGame();
    setResetToken((v) => v + 1);
  };

  void resetToken;
  void nowTick;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <HudBar
        difficulty={difficulty}
        seed={seed}
        steps={steps}
        timeText={timeText}
        bestText={bestText}
        palette={palette}
        onPickDifficulty={pickDifficulty}
        onPressSeed={() => {}}
      />
      <View style={styles.viewport} onLayout={onLayout}>
        {viewport.width > 0 && (
          <View
            style={[
              styles.world,
              { transform: [{ translateX: offsetX }, { translateY: offsetY }, { scale }] },
            ]}>
            <MazeSvg maze={maze} palette={palette} cellPx={BASE_CELL_DP} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  world: { position: 'absolute', left: 0, top: 0 },
});
