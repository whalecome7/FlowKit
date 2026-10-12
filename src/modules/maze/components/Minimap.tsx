import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { START_COLOR, FLAG_COLOR } from '../constants';
import type { CellPoint, MazeData } from '../types';

interface Props {
  maze: MazeData;
  trail: CellPoint[];
  /** 小球世界坐标（低频采样） */
  ballWorld: { x: number; y: number };
  /** 视口世界范围（低频采样） */
  viewportWorld: { x: number; y: number; w: number; h: number };
  /** 回调参数为"格空间坐标"（0..N） */
  onJump: (gx: number, gy: number) => void;
  size?: number;
}

export default function Minimap({ maze, trail, ballWorld, viewportWorld, onJump, size = 92 }: Props) {
  const pad = 6;
  const s = (size - pad * 2) / maze.N;

  const shapeCells = useMemo(() => {
    const rects: React.ReactElement[] = [];
    for (let i = 0; i < maze.N; i++) {
      for (let j = 0; j < maze.N; j++) {
        if (!maze.inS[2 * j + 1][2 * i + 1]) continue;
        rects.push(
          <Rect key={`s-${i}-${j}`} x={pad + i * s} y={pad + j * s} width={s} height={s} fill="rgba(130,120,170,0.28)" />,
        );
      }
    }
    return rects;
  }, [maze, s]);

  const trailCells = useMemo(() => {
    const rects: React.ReactElement[] = [];
    const seen = new Set<string>();
    for (const [i, j] of trail) {
      const k = `${i}-${j}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rects.push(
        <Rect key={`t-${k}`} x={pad + i * s} y={pad + j * s} width={s} height={s} fill="rgba(130,120,170,0.5)" />,
      );
    }
    return rects;
  }, [trail, s]);

  return (
    <View style={styles.wrap} pointerEvents="box-only">
      <Svg
        width={size}
        height={size}
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          onJump((locationX - pad) / s + 0.5, (locationY - pad) / s + 0.5);
        }}>
        <Rect x={0} y={0} width={size} height={size} rx={10} fill="rgba(255,255,255,0.9)" />
        {shapeCells}
        {trailCells}
        <Circle cx={pad + (maze.start[0] + 0.5) * s} cy={pad + (maze.start[1] + 0.5) * s} r={2.4} fill={START_COLOR} />
        <Circle cx={pad + (maze.end[0] + 0.5) * s} cy={pad + (maze.end[1] + 0.5) * s} r={2.8} fill={FLAG_COLOR} />
        <Rect
          x={pad + (viewportWorld.x / 2) * s}
          y={pad + (viewportWorld.y / 2) * s}
          width={(viewportWorld.w / 2) * s}
          height={(viewportWorld.h / 2) * s}
          stroke="rgba(60,50,100,0.55)"
          strokeWidth={1}
          fill="none"
        />
        <Circle cx={pad + (ballWorld.x / 2) * s} cy={pad + (ballWorld.y / 2) * s} r={2.6} fill="#64748b" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: 'rgba(40,30,80,0.25)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
});
