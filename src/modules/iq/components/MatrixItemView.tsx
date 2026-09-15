import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import type { MatrixCell, MatrixItem, ShapeKind, ShapeSpec } from '../types';

/** 图形基元 → Unicode 白名单字符（[实心, 空心]）；line 由 View 绘制 */
export const SHAPE_GLYPHS: Record<Exclude<ShapeKind, 'line'>, [string, string]> = {
  circle: ['●', '○'],
  square: ['■', '□'],
  triangle: ['▲', '△'],
  diamond: ['◆', '◇'],
  star: ['★', '☆'],
  arrow: ['↑', '↑'],
};

/** 取实心字形（符号检索等场景免去 Exclude 断言；line 回退为短横） */
export function glyphOf(kind: ShapeKind): string {
  if (kind === 'line') return '─';
  return SHAPE_GLYPHS[kind][0];
}

function ShapeView({ spec, size, color }: { spec: ShapeSpec; size: number; color: string }) {
  if (spec.kind === 'line') {
    return (
      <View
        style={[
          styles.line,
          {
            width: size * 0.9,
            backgroundColor: color,
            transform: [{ rotate: `${spec.rotation ?? 0}deg` }],
          },
        ]}
      />
    );
  }
  const glyph = SHAPE_GLYPHS[spec.kind][spec.fill === 'solid' ? 0 : 1].repeat(spec.count);
  return (
    <Text
      style={[
        {
          fontSize: spec.size === 'small' ? size * 0.7 : size,
          color,
          lineHeight: size * 1.15,
        },
        spec.rotation ? { transform: [{ rotate: `${spec.rotation}deg` }] } : null,
      ]}>
      {glyph}
    </Text>
  );
}

function CellView({ cell, size, color }: { cell: MatrixCell; size: number; color: string }) {
  return (
    <View style={styles.cellInner}>
      {cell.shapes.map((s, i) => (
        <ShapeView key={i} spec={s} size={size} color={color} />
      ))}
    </View>
  );
}

interface Props {
  item: MatrixItem;
  onSelect: (optionIndex: number) => void;
  /** 已选选项索引（练习高亮用；正式题不传） */
  selected?: number | null;
}

/** 矩阵（3×3）/ 序列（1×5）题渲染：末格为问号，六选一 */
export default function MatrixItemView({ item, onSelect, selected }: Props) {
  const { colors } = useTheme();
  const isMatrix = item.kind === 'matrix';
  const cellSize = isMatrix ? 96 : 60;
  const gridSize = isMatrix ? 30 : 34;

  return (
    <View>
      <View style={[isMatrix ? styles.matrixGrid : styles.sequenceGrid]}>
        {item.cells.map((cell, i) => (
          <View
            key={i}
            style={[
              styles.gridCell,
              {
                width: cellSize,
                height: cellSize,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}>
            {cell ? (
              <CellView cell={cell} size={gridSize} color={colors.text} />
            ) : (
              <Text style={{ fontSize: gridSize, color: colors.textMuted }}>?</Text>
            )}
          </View>
        ))}
      </View>
      <View style={styles.options}>
        {item.options.map((option, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onSelect(i)}
            style={[
              styles.option,
              {
                borderColor: selected === i ? colors.primary : colors.border,
                borderWidth: selected === i ? 2 : 1,
                backgroundColor: colors.surface,
              },
            ]}>
            <CellView cell={option} size={24} color={colors.text} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matrixGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  sequenceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  gridCell: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: 6,
  },
  cellInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  line: { height: 3, margin: 2, borderRadius: 2 },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
  },
  option: {
    width: 88,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 5,
    borderRadius: 10,
  },
});
