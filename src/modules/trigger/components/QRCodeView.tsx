import { Image, View, Text, StyleSheet } from 'react-native';
import { useMemo, useState, useEffect } from 'react';
import { NativeModules } from 'react-native';
import qrcode from 'qrcode-generator';

const { QRCodeModule } = NativeModules;

/**
 * 二维码展示：qrcode-generator 生成矩阵 → 原生 Bitmap 绘制 PNG → Image 显示。
 * 避免 RN 渲染上万 View 导致闪退（137×137 矩阵若用 View 渲染会崩）。
 */
export function QRCodeView({
  value,
  size = 180,
}: {
  value: string;
  size?: number;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matrix = useMemo(() => {
    try {
      const qr = qrcode(0, 'L'); // L 级纠错（7%）：矩阵更小更稀疏，规则 JSON 足够
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const rows: boolean[][] = [];
      for (let r = 0; r < count; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < count; c++) {
          row.push(qr.isDark(r, c));
        }
        rows.push(row);
      }
      return { rows, count };
    } catch (e) {
      setError('二维码生成失败：内容过长');
      return null;
    }
  }, [value]);

  useEffect(() => {
    if (!matrix) return;
    QRCodeModule?.render?.(JSON.stringify(matrix.rows), size, (uriResult: string | null) => {
      if (uriResult) setUri(uriResult);
      else setError('二维码渲染失败');
    });
  }, [matrix, size]);

  if (error) {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <Text style={styles.loadingText}>生成中…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Image source={{ uri }} style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 8, padding: 8 },
  box: {
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { color: '#ff6b6b', fontSize: 12, padding: 12, textAlign: 'center' },
  loadingText: { color: '#888', fontSize: 12 },
});
