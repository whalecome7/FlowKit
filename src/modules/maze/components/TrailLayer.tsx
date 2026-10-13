import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { GHOST_COLOR, PATH_COLOR } from '../constants';
import type { CellPoint, MazeData } from '../types';

interface Props {
  maze: MazeData;
  cellPx: number;
  ghost: CellPoint[] | null;
  shortestPath: CellPoint[] | null;
}

function cellPoint(cell: CellPoint, cellPx: number): string {
  return `${(2 * cell[0] + 1.5) * cellPx} ${(2 * cell[1] + 1.5) * cellPx}`;
}

function buildSegments(trail: CellPoint[], cellPx: number): string[] {
  const segs: string[] = [];
  for (let n = 1; n < trail.length; n++) {
    segs.push(`M ${cellPoint(trail[n - 1], cellPx)} L ${cellPoint(trail[n], cellPx)}`);
  }
  return segs;
}

/** 回顾层：历史迷宫幽灵轨迹（格折线）与最短路径（虚线）——仅查看模式使用，无实时性 */
function TrailLayerInner({ maze, cellPx, ghost, shortestPath }: Props) {
  const size = maze.G * cellPx;

  const ghostD = useMemo(() => (ghost ? buildSegments(ghost, cellPx).join(' ') : ''), [ghost, cellPx]);
  const pathD = useMemo(
    () => (shortestPath ? buildSegments(shortestPath, cellPx).join(' ') : ''),
    [shortestPath, cellPx],
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: 'absolute', left: 0, top: 0 }}>
      {ghostD !== '' && (
        <Path
          d={ghostD}
          stroke={GHOST_COLOR}
          strokeWidth={cellPx * 0.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {pathD !== '' && (
        <Path
          d={pathD}
          stroke={PATH_COLOR}
          strokeWidth={cellPx * 0.16}
          strokeLinecap="round"
          strokeDasharray={`${cellPx * 0.42} ${cellPx * 0.42}`}
          fill="none"
        />
      )}
    </Svg>
  );
}

export default React.memo(TrailLayerInner);
