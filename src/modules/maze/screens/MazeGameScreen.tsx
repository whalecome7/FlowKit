import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../../theme';
import { BASE_CELL_DP, paletteForSeed, TRAIL_STYLE_LABEL } from '../constants';
import BallView from '../components/BallView';
import MazeSvg from '../components/MazeSvg';
import Minimap from '../components/Minimap';
import TrailLayer from '../components/TrailLayer';
import HudBar from '../components/HudBar';
import Joystick from '../components/Joystick';
import { WinModal } from '../components/GameModals';
import { useGameEngine } from '../hooks/useGameEngine';
import { findShortestPath, generateMaze } from '../services/generator';
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
  const trailStyle = useMazeStore((s) => s.trailStyle);
  const cycleTrailStyle = useMazeStore((s) => s.cycleTrailStyle);

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

  const viewportRef = useRef<View>(null);
  const viewportOriginRef = useRef({ x: 0, y: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
    viewportRef.current?.measureInWindow((x, y) => {
      viewportOriginRef.current = { x, y };
    });
  };

  const ballRef = useRef<View>(null);
  const containerRef = useRef<View>(null);
  const camScaleRef = useRef(1);
  const cellPxRef = useRef(BASE_CELL_DP);
  const [cellPxState, setCellPxState] = useState(BASE_CELL_DP);
  const [miniSnap, setMiniSnap] = useState({ ball: { x: 0, y: 0 }, view: { x: 0, y: 0, w: 0, h: 0 } });
  const [hint, setHint] = useState('');
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ d: number } | null>(null);
  const lastTapRef = useRef(0);
  const movedSinceGrantRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trailVersion, setTrailVersion] = useState(0);
  const trailRef = useRef<CellPoint[]>([[maze.start[0], maze.start[1]]]);
  // trailVersion 作为唯一依赖：ref 写入不触发渲染，需版本号驱动快照重建
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trailSnapshot = useMemo(() => trailRef.current.slice(), [trailVersion]);

  useEffect(() => {
    cellPxRef.current = cellPxState;
  }, [cellPxState]);

  const engine = useGameEngine({
    maze,
    joyRef,
    ballViewRef: ballRef,
    containerRef,
    viewport,
    resetToken,
    camScaleRef,
    cellPxRef,
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
          if (refreshed) loadBest().then(useMazeStore.getState().setBest).catch(() => {});
        })
        .catch(() => {
          // 存储写入失败静默（不影响对局）
        });
      void addHistoryRecord(rec)
        .then(useMazeStore.getState().setHistory)
        .catch(() => {
          // 存储写入失败静默（不影响对局）
        });
    },
  });
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    trailRef.current = [[maze.start[0], maze.start[1]]];
    setTrailVersion((v) => v + 1);
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, [maze, resetToken]);

  // 卸载清理：清掉可能挂起的防抖/提示定时器
  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  // 缩略图低频采样（球位置与视口世界范围），150ms 足够 UI 平滑
  useEffect(() => {
    const t = setInterval(() => {
      const b = engineRef.current.getBall();
      const c = engineRef.current.getCam();
      const k = cellPxRef.current * engineRef.current.getCamScale();
      const next = {
        ball: { x: b.x, y: b.y },
        view: {
          x: c.x - viewport.width / k / 2,
          y: c.y - viewport.height / k / 2,
          w: viewport.width / k,
          h: viewport.height / k,
        },
      };
      setMiniSnap((prev) =>
        Math.abs(prev.ball.x - next.ball.x) < 0.01 &&
        Math.abs(prev.ball.y - next.ball.y) < 0.01 &&
        Math.abs(prev.view.x - next.view.x) < 0.01 &&
        Math.abs(prev.view.y - next.view.y) < 0.01 &&
        Math.abs(prev.view.w - next.view.w) < 0.01 &&
        Math.abs(prev.view.h - next.view.h) < 0.01
          ? prev
          : next,
      );
    }, 150);
    return () => clearInterval(t);
  }, [viewport.width, viewport.height]);

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

  const showHint = () => {
    const b = engineRef.current.getBall();
    const from: CellPoint = [Math.floor((b.x - 1) / 2), Math.floor((b.y - 1) / 2)];
    const path = findShortestPath(maze, from, maze.end);
    setHint(path && path.length > 1 ? `距终点还有 ${path.length - 1} 格路程` : '已经在终点啦');
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      setHint('');
    }, 1800);
  };

  // 手势：单指平移 / 双指缩放 / 双击回跟随；手势结束后 250ms 澄清缩放
  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }
          const now = Date.now();
          if (now - lastTapRef.current < 300 && !movedSinceGrantRef.current) {
            engineRef.current.followBall();
            lastTapRef.current = 0;
            dragRef.current = null;
            pinchRef.current = null;
            movedSinceGrantRef.current = false;
            return;
          }
          lastTapRef.current = now;
          movedSinceGrantRef.current = false;
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            pinchRef.current = {
              d: Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY),
            };
          } else if (touches.length === 1) {
            dragRef.current = { x: touches[0].pageX, y: touches[0].pageY };
          }
        },
        onPanResponderMove: (evt) => {
          movedSinceGrantRef.current = true;
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2 && pinchRef.current) {
            const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
            if (pinchRef.current.d > 0) {
              engineRef.current.zoomAt(
                (touches[0].pageX + touches[1].pageX) / 2 - viewportOriginRef.current.x,
                (touches[0].pageY + touches[1].pageY) / 2 - viewportOriginRef.current.y,
                d / pinchRef.current.d,
              );
            }
            pinchRef.current.d = d;
            engineRef.current.manual();
          } else if (dragRef.current && touches.length === 1) {
            const dx = touches[0].pageX - dragRef.current.x;
            const dy = touches[0].pageY - dragRef.current.y;
            engineRef.current.pan(dx, dy);
            dragRef.current = { x: touches[0].pageX, y: touches[0].pageY };
            engineRef.current.manual();
          }
        },
        onPanResponderRelease: endGesture,
        onPanResponderTerminate: endGesture,
      }),
    [],
  );

  function endGesture() {
    dragRef.current = null;
    pinchRef.current = null;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const px = engineRef.current.settleZoom();
      if (px) setCellPxState(px);
    }, 250);
  }

  // nowTick：计时显示的渲染驱动（每 100ms 触发 timeText 重新求值）
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
        onPressSeed={() => { /* T16：打开种子面板 */ }}
      />
      <View ref={viewportRef} style={styles.viewport} onLayout={onLayout} {...gesture.panHandlers}>
        {viewport.width > 0 && (
          <View ref={containerRef} style={styles.world}>
            <MazeSvg maze={maze} palette={palette} cellPx={cellPxState} />
            <TrailLayer
              maze={maze}
              cellPx={cellPxState}
              palette={palette}
              trailStyle={trailStyle}
              trail={trailSnapshot}
              ghost={null}
              shortestPath={null}
            />
          </View>
        )}
        <BallView ref={ballRef} />
        <Minimap
          maze={maze}
          trail={trailSnapshot}
          ballWorld={miniSnap.ball}
          viewportWorld={miniSnap.view}
          onJump={(gx, gy) => engineRef.current.jumpTo(gx * 2 + 0.5, gy * 2 + 0.5)}
        />
        {hint !== '' && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        )}
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
          <TouchableOpacity
            style={[styles.gbtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={cycleTrailStyle}>
            <Text style={[styles.gbtnText, { color: colors.textSecondary }]}>
              {TRAIL_STYLE_LABEL[trailStyle]}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gbtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => engineRef.current.followBall()}>
            <Text style={[styles.gbtnText, { color: colors.textSecondary }]}>🎯 跟球</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gbtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={showHint}>
            <Text style={[styles.gbtnText, { color: colors.textSecondary }]}>💡 提示</Text>
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
  hintWrap: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  hintText: {
    backgroundColor: 'rgba(50,40,90,0.92)',
    color: '#fff',
    fontSize: 12.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
