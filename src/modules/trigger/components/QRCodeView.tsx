import { View } from 'react-native';
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** 二维码展示（qrcode-generator 矩阵 + View 渲染，无原生依赖） */
export function QRCodeView({
  value,
  size = 180,
}: {
  value: string;
  size?: number;
}) {
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(value);
    q.make();
    return q;
  }, [value]);

  const count = qr.getModuleCount();
  const cellSize = size / count;

  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', padding: 8 }}>
      {Array.from({ length: count }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: count }).map((_, col) => (
            <View
              key={col}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: qr.isDark(row, col) ? '#000' : '#fff',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
