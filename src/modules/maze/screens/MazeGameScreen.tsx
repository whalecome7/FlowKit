import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BASE_CELL_DP,
  DIFFS,
  joystickZoneHeight,
  paletteForSeed,
  TRAIL_STYLE_LABEL,
  TRAIL_WIDTH,
} from '../constants';
import BallView from '../components/BallView';
import MazeSvg from '../components/MazeSvg';
import Minimap from '../components/Minimap';
import TrailLayer from '../components/TrailLayer';
import HudBar from '../components/HudBar';
import JoystickView from '../components/JoystickView';
import type { JoystickViewHandle } from '../components/JoystickView';
import ButtonDrawer from '../components/ButtonDrawer';
import { SeedModal, ViewBanner, WinModal } from '../components/GameModals';
import { useGameEngine } from '../hooks/useGameEngine';
import { useGameGestures } from '../hooks/useGameGestures';
import { findShortestPath, generateMaze } from '../services/generator';
import { addHistoryRecord, loadBest, upsertBest } from '../services/storage';
import { decodeTrail, encodeTrail } from '../services/trailCodec';
import { useMazeStore } from '../store';
import type { MazeStackParamList } from './MazeHistoryScreen';
import type { CellPoint, HistoryRecord, JoyVector, MazeDifficulty } from '../types';

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
  const setDifficulty = useMazeStore((s) => s.setDifficulty);
  const setSeed = useMazeStore((s) => s.setSeed);
  const resetGame = useMazeStore((s) => s.resetGame);
  const setBest = useMazeStore((s) => s.setBest);
  const trailStyle = useMazeStore((s) => s.trailStyle);
  const cycleTrailStyle = useMazeStore((s) => s.cycleTrailStyle);

  const joyRef = useRef<JoyVector>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [resetToken, setResetToken] = useState(0);
  const [timeText, setTimeText] = useState('00:00.0');
  const [seedModal, setSeedModal] = useState(false);

  const maze = useMemo(() => generateMaze(seed, difficulty), [seed, difficulty]);
  const palette = useMemo(() => paletteForSeed(seed), [seed]);

  const navigation = useNavigation<NativeStackNavigationProp<MazeStackParamList>>();
  const route = useRoute<RouteProp<MazeStackParamList, 'MazeGame'>>();
  const viewRecord = route.params?.viewRecord ?? null;
  const [viewingRecord, setViewingRecord] = useState<HistoryRecord | null>(null);
  const [showShortest, setShowShortest] = useState(false);
  const ghost = useMemo(
    () => (viewingRecord ? decodeTrail(viewingRecord.trail) : null),
    [viewingRecord],
  );
  const shortestPath = useMemo(
    () => (showShortest ? findShortestPath(maze, maze.start, maze.end) : null),
    [showShortest, maze],
  );

  useEffect(() => {
    loadBest().then(setBest);
  }, [setBest]);

  // 挂载时同步 store（幂等）：防卸载重挂载后引擎为全新实例（ready）
  // 而 store 残留 playing（幽灵计时）
  useEffect(() => {
    useMazeStore.getState().resetGame();
  }, []);

  // 路由参数播种查看模式：须声明在挂载 resetGame effect 之后（先清场后播种）
  useEffect(() => {
    if (!viewRecord) return;
    useMazeStore.getState().setDifficulty(viewRecord.difficulty);
    useMazeStore.getState().setSeed(viewRecord.seed);
    useMazeStore.getState().resetGame();
    setViewingRecord(viewRecord);
    setShowShortest(false);
    // 无条件 bump：即使 seed/difficulty 与当前值相同（maze 引用不变），也必须重置引擎
    setResetToken((v) => v + 1);
    // 消费参数，避免关闭横幅后 route.params 残留
    navigation.setParams({ viewRecord: undefined });
  }, [viewRecord, navigation]);

  // 计时文本：仅在显示值变化时 setText（跳秒才重渲染，避免 10fps 空渲染干扰缩放）
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const next = fmtTime(Date.now() - useMazeStore.getState().startedAt);
      setTimeText((prev) => (prev === next ? prev : next));
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);

  // won/ready 的计时文本直接同步（playing 由上面的 interval 驱动）
  useEffect(() => {
    if (phase === 'won') setTimeText(fmtTime(elapsedMs));
    if (phase === 'ready') setTimeText('00:00.0');
  }, [phase, elapsedMs]);

  const bestText = best[difficulty] ? fmtTime(best[difficulty]!.timeMs) : '--';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
  };

  const ballRef = useRef<View>(null);
  const containerRef = useRef<View>(null);
  const camScaleRef = useRef(1);
  const cellPxRef = useRef(BASE_CELL_DP);
  const [cellPxState, setCellPxState] = useState(BASE_CELL_DP);
  const [miniSnap, setMiniSnap] = useState({ ball: { x: 0, y: 0 }, view: { x: 0, y: 0, w: 0, h: 0 } });
  const [hint, setHint] = useState('');
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 澄清待落地标记：cellPxState 更新后在同一 effect 中调用 applySettle（与 camScale 成对生效） */
  const settlePendingRef = useRef(false);
  const [trailVersion, setTrailVersion] = useState(0);
  const trailRef = useRef<CellPoint[]>([[maze.start[0], maze.start[1]]]);
  // trailVersion 作为唯一依赖：ref 写入不触发渲染，需版本号驱动快照重建
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trailSnapshot = useMemo(() => trailRef.current.slice(), [trailVersion]);

  // 轨迹实时尾巴线：viewport 层一条线 View，从倒数第二个格中心（无则起点格）直连球当前位置，
  // 由引擎 onTick 每帧直写（静态折线只画到倒数第二个格）——端点恒贴球、无分段跳变；
  // 颜色随风格/步数低频变化，经 ref 供直写读取（避免 outdated 闭包）
  const tailColor = useMemo(() => {
    if (trailStyle === 'rainbow') {
      return `hsl(${(steps * 15) % 360}, 85%, 52%)`;
    }
    return palette.wallDark;
  }, [trailStyle, steps, palette.wallDark]);
  const tailColorRef = useRef(tailColor);
  tailColorRef.current = tailColor;
  const tailRef = useRef<View>(null);
  const updateTail = () => {
    const v = tailRef.current;
    if (!v) return;
    const b = engineRef.current.getBall();
    const c = engineRef.current.getCam();
    const k = cellPxRef.current * engineRef.current.getCamScale();
    const trail = trailRef.current;
    const anchor = trail.length >= 2 ? trail[trail.length - 2] : trail[trail.length - 1];
    if (!anchor) return;
    const p1x = (2 * anchor[0] + 1.5 - c.x) * k + viewport.width / 2;
    const p1y = (2 * anchor[1] + 1.5 - c.y) * k + viewport.height / 2;
    const p2x = (b.x - c.x) * k + viewport.width / 2;
    const p2y = (b.y - c.y) * k + viewport.height / 2;
    const len = Math.hypot(p2x - p1x, p2y - p1y);
    const w = TRAIL_WIDTH * k;
    if (len < 0.5) {
      v.setNativeProps({ style: { opacity: 0 } });
      return;
    }
    const angle = (Math.atan2(p2y - p1y, p2x - p1x) * 180) / Math.PI;
    v.setNativeProps({
      style: {
        opacity: 1,
        left: (p1x + p2x) / 2 - len / 2,
        top: (p1y + p2y) / 2 - w / 2,
        width: len,
        height: w,
        borderRadius: w / 2,
        backgroundColor: tailColorRef.current,
        transform: [{ rotate: `${angle}deg` }],
      },
    });
  };
  // 供低频 effect（换局即时收起）调用最新闭包，避免 exhaustive-deps 抖动
  const updateTailRef = useRef(updateTail);
  updateTailRef.current = updateTail;

  const engine = useGameEngine({
    maze,
    joyRef,
    ballViewRef: ballRef,
    containerRef,
    viewport,
    resetToken,
    camScaleRef,
    cellPxRef,
    onTick: updateTail,
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

  /** 缩放澄清调度：镜头触摸清空后 250ms 计算目标 cellPx（与 applySettle 成对落地） */
  const scheduleSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const px = engineRef.current.settleZoom();
      if (px) {
        settlePendingRef.current = true;
        setCellPxState(px);
      }
    }, 250);
  }, []);

  // 统一手势层：整个游戏区（viewport + 摇杆带）单 PanResponder——按下按区域分配归属，
  // 带内=摇杆（写 joyRef）、迷宫区=镜头（引擎 pan/zoomAt）；拖到任何区域都继续原逻辑。
  const joystickViewRef = useRef<JoystickViewHandle>(null);
  const joyZoneHeight = joystickZoneHeight(Dimensions.get('window').height);
  const gesture = useGameGestures({
    onJoystickVector: (v) => {
      joyRef.current = v;
    },
    joystickRef: joystickViewRef,
    cam: {
      manual: () => engineRef.current.manual(),
      pan: (dx, dy) => engineRef.current.pan(dx, dy),
      zoomAt: (x, y, f) => engineRef.current.zoomAt(x, y, f),
      followBall: () => engineRef.current.followBall(),
    },
    onCameraIdle: scheduleSettle,
    // 任一触摸按下 → 取消排队中的缩放澄清（防"抬起后 250ms 内重新按下 → 澄清在拖动中落地"）
    onGestureStart: () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
  });

  // cellPx 同步：澄清待落地时在同一 effect 中调用 applySettle（camScale 归 1 + 重写视图），
  // 使 cellPx 与 camScale 成对生效，消除 1-2 帧断拍抖动
  useEffect(() => {
    cellPxRef.current = cellPxState;
    if (settlePendingRef.current) {
      settlePendingRef.current = false;
      engineRef.current.applySettle();
    }
  }, [cellPxState]);

  useEffect(() => {
    trailRef.current = [[maze.start[0], maze.start[1]]];
    setTrailVersion((v) => v + 1);
    // 尾巴线即时复位：此时引擎已 reset 回起点（本 effect 晚于引擎 reset effect 执行），
    // 轨迹仅剩起点 → 与球重合（长度 ≈ 0）→ 直写收起
    updateTailRef.current();
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setHint('');
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

  // 重开一局的统一入口：先归零 store 并清查看态，再 bump 引擎 resetToken
  // （useCallback：drawerActions 依赖其引用稳定，避免 lint 报不稳定依赖）
  const resetAndBump = useCallback(() => {
    resetGame();
    setViewingRecord(null);
    setShowShortest(false);
    setResetToken((v) => v + 1);
  }, [resetGame]);

  const pickDifficulty = (d: MazeDifficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setSeed(randSeed());
    resetAndBump();
  };

  const newMaze = useCallback(() => {
    setSeed(randSeed());
    resetAndBump();
  }, [setSeed, resetAndBump]);

  const restart = resetAndBump;

  const showHint = useCallback(() => {
    const b = engineRef.current.getBall();
    const from: CellPoint = [Math.floor((b.x - 1) / 2), Math.floor((b.y - 1) / 2)];
    const path = findShortestPath(maze, from, maze.end);
    setHint(path && path.length > 1 ? `距终点还有 ${path.length - 1} 格路程` : '已经在终点啦');
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      setHint('');
    }, 1800);
  }, [maze]);

  const drawerActions = useMemo(
    () => [
      { key: 'new', label: '🎲 新迷宫', highlight: true, onPress: newMaze },
      { key: 'restart', label: '↻ 重开', onPress: restart },
      { key: 'trail', label: TRAIL_STYLE_LABEL[trailStyle], onPress: cycleTrailStyle },
      { key: 'history', label: '📜 历史', onPress: () => navigation.navigate('MazeHistory') },
      { key: 'follow', label: '🎯 跟球', onPress: () => engineRef.current.followBall() },
      { key: 'hint', label: '💡 提示', onPress: showHint },
    ],
    [trailStyle, newMaze, restart, cycleTrailStyle, navigation, showHint],
  );

  // 手势：单指平移 / 双指缩放 / 双击回跟随（统一手势层见上方 useGameGestures；
  // 手势结束后 250ms 澄清缩放，见 scheduleSettle）

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
        onPressSeed={() => setSeedModal(true)}
      />
      {/* 统一手势区：viewport（迷宫+镜头）与底部摇杆带共用一个 PanResponder，
          触摸在按下瞬间按区域分配归属（带内=摇杆、迷宫区=镜头），拖动中不换目标 */}
      <View
        style={styles.region}
        ref={gesture.regionRef}
        onLayout={gesture.onRegionLayout}
        {...gesture.regionHandlers}>
        <View style={styles.viewport} onLayout={onLayout}>
          {viewport.width > 0 && (
            <View ref={containerRef} style={styles.world}>
              <MazeSvg maze={maze} palette={palette} cellPx={cellPxState} />
              <TrailLayer
                maze={maze}
                cellPx={cellPxState}
                palette={palette}
                trailStyle={trailStyle}
                trail={trailSnapshot}
                ghost={ghost}
                shortestPath={shortestPath}
              />
            </View>
          )}
          {/* 实时尾巴线：viewport 层（不经容器变换），由引擎 onTick 每帧直写；置于球下层 */}
          <View ref={tailRef} testID="trail-tail" pointerEvents="none" style={styles.trailTail} />
          <BallView ref={ballRef} />
          <Minimap
            maze={maze}
            trail={trailSnapshot}
            ballWorld={miniSnap.ball}
            viewportWorld={miniSnap.view}
            onJump={(gx, gy) => engineRef.current.jumpTo(gx * 2 + 0.5, gy * 2 + 0.5)}
          />
          <ViewBanner
            visible={viewingRecord !== null}
            text={
              viewingRecord
                ? `🔍 历史迷宫 · ${DIFFS[viewingRecord.difficulty].label} · 当年 ${fmtTime(viewingRecord.timeMs)} / ${viewingRecord.steps} 步`
                : ''
            }
            pathShown={showShortest}
            palette={palette}
            onTogglePath={() => setShowShortest((v) => !v)}
            onRechallenge={resetAndBump}
            onClose={() => {
              setViewingRecord(null);
              setShowShortest(false);
            }}
          />
          {hint !== '' && (
            <View style={styles.hintWrap} pointerEvents="none">
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          )}
        </View>
        {/* 摇杆带：迷宫视口之下的固定留白区（常驻摇杆居中），触摸归摇杆逻辑 */}
        <View style={{ height: joyZoneHeight }}>
          <JoystickView ref={joystickViewRef} />
        </View>
      </View>
      {/* 抽屉置于根层：容器覆盖全屏（遮罩可盖住 HUD 与迷宫），box-none 透传底层触摸 */}
      <ButtonDrawer actions={drawerActions} palette={palette} />
      <WinModal
        visible={phase === 'won'}
        timeText={fmtTime(elapsedMs)}
        steps={steps}
        bestText={bestText}
        palette={palette}
        onAgain={restart}
        onNewMaze={newMaze}
      />
      <SeedModal
        visible={seedModal}
        seed={seed}
        palette={palette}
        onClose={() => setSeedModal(false)}
        onGenerate={(s) => {
          setSeedModal(false);
          setSeed(s);
          resetAndBump();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // 统一手势区：viewport（flex:1）+ 底部摇杆带（高度由 joystickZoneHeight 动态计算）
  region: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  world: { position: 'absolute', left: 0, top: 0 },
  trailTail: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    borderRadius: 0,
    opacity: 0,
  },
  hintWrap: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center', zIndex: 50 },
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
