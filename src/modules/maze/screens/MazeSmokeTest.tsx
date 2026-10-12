import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Circle, Path, G } from 'react-native-svg';

export default function MazeSmokeTest() {
  const rects = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      rects.push(
        <Rect
          key={`${r}-${c}`}
          x={c * 20 + 2}
          y={r * 20 + 2}
          width={16}
          height={16}
          rx={4}
          fill="#a78bfa"
        />,
      );
    }
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf7ff' }}>
      <Text style={{ marginBottom: 12 }}>react-native-svg 冒烟验证</Text>
      <Svg width={110} height={110} viewBox="0 0 110 110">
        <G>{rects}</G>
        <Circle cx={40} cy={40} r={14} fill="none" stroke="#22c55e" strokeWidth={4} strokeDasharray="7 5" strokeLinecap="round" />
        <Path d="M 70 75 L 90 55 L 70 40 Z" fill="#f43f5e" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
