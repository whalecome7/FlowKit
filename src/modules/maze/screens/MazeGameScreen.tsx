import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../../theme';
import { BASE_CELL_DP, INITIAL_CELL_DP, paletteForSeed } from '../constants';
import BallView from '../components/BallView';
import MazeSvg from '../components/MazeSvg';
import HudBar from '../components/HudBar';
import Joystick from '../components/Joystick';
import { WinModal } from '../components/GameModals';
import { useGameEngine } from '../hooks/useGameEngine';
import { generateMaze } from '../services/generator';
import { addHistoryRecord, loadBest, upsertBest } from '../services/storage';
import { encodeTrail } from '../services/trailCodec';
import { useMazeStore } from '../store';
import type { CellPoint, JoyVector, MazeDifficulty } from '../types';

function randSeed(): number {
  return 1000000 + Math.floor(Math.random() * 9000000);
}

function fmtTime(ms: number): string {
  const total = Math.round(ms / 100) / 10; // 先量化到 0.1s，避免 59.95s 舍入出 "60.0"
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

  const { colors } = useTheme();
  const joyRef = useRef<JoyVector>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [resetToken, setResetToken] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const maze = useMemo(() => generateMaze(seed, difficulty), [seed, difficulty]);
  const palette = useMemo(() => paletteForSeed(seed), [seed]);

  useEffect(() => {
    loadBest().then(setBest);
  }, [setBest]);

  // 挂载时同步 store（幂等）：防卸载重挂载后引擎为全新实例（ready）
  // 而 store 残留 playing（幽灵计时）
  useEffect(() => {
    useMazeStore.getState().resetGame();
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => setNowTick((v) => v + 1), 100);
    return () => clearInterval(timer);
  }, [phase]);

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
  const scale = Math.max(fit, INITIAL_CELL_DP) / BASE_CELL_DP;

  const ballRef = useRef<View>(null);
  const containerRef = useRef<View>(null);
  const camScaleRef = useRef(scale);
  const [trailVersion, setTrailVersion] = useState(0);
  const trailRef = useRef<CellPoint[]>([[maze.start[0], maze.start[1]]]);

  useEffect(() => {
    camScaleRef.current = scale;
  }, [scale]);

  useGameEngine({
    maze,
    joyRef,
    ballViewRef: ballRef,
    containerRef,
    viewport,
    resetToken,
    camScaleRef,
    onStart: () => useMazeStore.getState().startGame(Date.now()),
    onEnterCell: (cell) => {
      trailRef.current.push(cell);
      useMazeStore.getState().addStep();
      setTrailVersion((v) => v + 1);
    },
    onWin: (ms) => {
      useMazeStore.getState().winGame(ms);
      const stepsNow = useMazeStore.getState().steps;
      const rec = {
        difficulty,
        seed,
        timeMs: ms,
        steps: stepsNow,
        at: Date.now(),
        trail: encodeTrail(trailRef.current),
      };
      void upsertBest(difficulty, { timeMs: ms, steps: stepsNow })
        .then((refreshed) => {
          if (refreshed) loadBest().then(useMazeStore.getState().setBest);
        })
        .catch(() => {
          // 存储写入失败静默（不影响对局）
        });
      void addHistoryRecord(rec)
        .then(useMazeStore.getState().setHistory)
        .catch(() => {});
    },
  });

  useEffect(() => {
    trailRef.current = [[maze.start[0], maze.start[1]]];
    setTrailVersion((v) => v + 1);
  }, [maze, resetToken]);

  // 重开一局的统一入口：先归零 store，再 bump 引擎 resetToken
  const resetAndBump = () => {
    resetGame();
    setResetToken((v) => v + 1);
  };

  const pickDifficulty = (d: MazeDifficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setSeed(randSeed());
    resetAndBump();
  };

  const newMaze = () => {
    setSeed(randSeed());
    resetAndBump();
  };

  const restart = resetAndBump;

  // nowTick：计时显示的渲染驱动（每 100ms 触发 timeText 重新求值）
  // trailVersion：轨迹层刷新信号（T14 的 TrailLayer 将消费）
  void nowTick;
  void trailVersion;

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
        onPressSeed={() => { /* T16：打开种子面板 */ }}
      />
      <View style={styles.viewport} onLayout={onLayout}>
        {viewport.width > 0 && (
          <View ref={containerRef} style={styles.world}>
            <MazeSvg maze={maze} palette={palette} cellPx={BASE_CELL_DP} />
          </View>
        )}
        <BallView ref={ballRef} />
      </View>
      <View style={[styles.bottom, { backgroundColor: palette.bg }]}>
        <Joystick
          onMove={(v) => {
            joyRef.current = v;
          }}
        />
        <View style={styles.btnGrid}>
          <TouchableOpacity
            style={[styles.gbtn, { backgroundColor: palette.wall }]}
            onPress={newMaze}>
            <Text style={styles.gbtnTextLight}>🎲 新迷宫</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gbtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={restart}>
            <Text style={[styles.gbtnText, { color: colors.textSecondary }]}>↻ 重开</Text>
          </TouchableOpacity>
        </View>
      </View>
      <WinModal
        visible={phase === 'won'}
        timeText={fmtTime(elapsedMs)}
        steps={steps}
        bestText={bestText}
        palette={palette}
        onAgain={restart}
        onNewMaze={newMaze}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  world: { position: 'absolute', left: 0, top: 0 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gbtn: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  gbtnTextLight: { color: '#fff', fontSize: 14, fontWeight: '600' },
  gbtnText: { fontSize: 14, fontWeight: '600' },
});
