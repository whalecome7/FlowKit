import React, { useMemo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { FLAG_COLOR, FLAG_POLE_COLOR, START_COLOR, WALL_THICKNESS, type Palette } from '../constants';
import type { MazeData } from '../types';

interface Props {
  maze: MazeData;
  palette: Palette;
  /** 每单元绘制像素（dp）。调用方传入（通常为 BASE_CELL_DP），缩放由容器 transform/澄清机制处理 */
  cellPx: number;
}

/** 静态层：墙糖块 + 起点虚线环 + 终点旗帜。memo 锁死，仅换局/澄清缩放时重绘 */
function MazeSvgInner({ maze, palette, cellPx }: Props) {
  const viewSize = maze.G * cellPx;

  const wallRects = useMemo(() => {
    const grid = maze.G;
    const t = cellPx * WALL_THICKNESS;
    const rects: React.ReactElement[] = [];
    const isWall = (r: number, c: number): boolean => {
      if (maze.cells[r][c] !== 1) return false;
      if (maze.inS[r][c]) return true;
      return (
        (r > 0 && maze.inS[r - 1][c]) ||
        (r < grid - 1 && maze.inS[r + 1][c]) ||
        (c > 0 && maze.inS[r][c - 1]) ||
        (c < grid - 1 && maze.inS[r][c + 1])
      );
    };
    // 水平墙线：偶数行（水平隔断带，含角位）按 run 合并为细长条（y 取行中心）
    for (let r = 0; r < grid; r += 2) {
      let c = 0;
      while (c < grid) {
        if (!isWall(r, c)) {
          c++;
          continue;
        }
        let end = c;
        while (end < grid && isWall(r, end)) end++;
        rects.push(
          <Rect
            key={`h${r}-${c}`}
            x={c * cellPx}
            y={(r + 0.5) * cellPx - t / 2}
            width={(end - c) * cellPx}
            height={t}
            fill={palette.wall}
          />,
        );
        c = end;
      }
    }
    // 竖直墙线：偶数列（竖直隔断带，含角位）按 run 合并为细长条（x 取列中心）
    for (let c = 0; c < grid; c += 2) {
      let r = 0;
      while (r < grid) {
        if (!isWall(r, c)) {
          r++;
          continue;
        }
        let end = r;
        while (end < grid && isWall(end, c)) end++;
        rects.push(
          <Rect
            key={`v${c}-${r}`}
            x={(c + 0.5) * cellPx - t / 2}
            y={r * cellPx}
            width={t}
            height={(end - r) * cellPx}
            fill={palette.wall}
          />,
        );
        r = end;
      }
    }
    return rects;
  }, [maze, palette.wall, cellPx]);

  const startX = (2 * maze.start[0] + 1.5) * cellPx;
  const startY = (2 * maze.start[1] + 1.5) * cellPx;
  const endX = (2 * maze.end[0] + 1.5) * cellPx;
  const endY = (2 * maze.end[1] + 1.5) * cellPx;
  const flagTop = endY - cellPx * 0.88;
  const flagBot = endY + cellPx * 0.84;
  const flagMid = endY - cellPx * 0.54;
  const flagLow = endY - cellPx * 0.2;

  return (
    <Svg width={viewSize} height={viewSize} viewBox={`0 0 ${viewSize} ${viewSize}`}>
      <Rect x={0} y={0} width={viewSize} height={viewSize} fill={palette.bg} />
      <G>{wallRects}</G>
      <Circle
        cx={startX}
        cy={startY}
        r={cellPx * 0.72}
        fill="none"
        stroke={START_COLOR}
        strokeWidth={cellPx * 0.2}
        strokeDasharray={`${cellPx * 0.39} ${cellPx * 0.32}`}
        strokeLinecap="round"
      />
      <Circle cx={endX} cy={endY} r={cellPx * 1.1} fill="#ffffff" opacity={0.55} />
      <Path
        d={`M ${endX} ${flagBot} L ${endX} ${flagTop}`}
        stroke={FLAG_POLE_COLOR}
        strokeWidth={cellPx * 0.14}
        strokeLinecap="round"
      />
      <Path
        d={`M ${endX} ${flagTop} L ${endX + cellPx * 0.88} ${flagMid} L ${endX} ${flagLow} Z`}
        fill={FLAG_COLOR}
        stroke={FLAG_COLOR}
        strokeWidth={cellPx * 0.12}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default React.memo(MazeSvgInner);
