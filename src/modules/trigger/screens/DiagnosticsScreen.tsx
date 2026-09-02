import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, NativeModules, Linking } from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';

const { SmsBridge } = NativeModules;

interface Diagnostics {
  heartbeatTs: number;
  rulesSynced: number;
  canExactAlarms: boolean;
  serviceDeadTs: number;
  perms: {
    receiveSms: boolean;
    readSms: boolean;
    notifications: boolean;
    batteryExempt: boolean;
    keepaliveChannel: boolean;
  };
}

/** 自诊断页：保活心跳 / 权限状态 / 规则快照 / 最近触发 */
export default function DiagnosticsScreen() {
  const { colors } = useTheme();
  const { logs } = useTriggerStore();
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  const refresh = () => {
    SmsBridge?.getDiagnostics?.((d: Diagnostics) => setDiag(d));
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const heartbeatText = diag && diag.heartbeatTs > 0
    ? `${Math.max(0, Math.round((Date.now() - diag.heartbeatTs) / 1000))} 秒前`
    : '无心跳';
  const serviceRunning = !!diag && diag.heartbeatTs > 0 && Date.now() - diag.heartbeatTs < 60_000;

  const perms: { key: keyof Diagnostics['perms']; label: string; ok: boolean }[] = [
    { key: 'receiveSms', label: '短信接收', ok: !!diag?.perms.receiveSms },
    { key: 'readSms', label: '读取短信', ok: !!diag?.perms.readSms },
    { key: 'notifications', label: '通知', ok: !!diag?.perms.notifications },
    { key: 'batteryExempt', label: '电池无限制', ok: !!diag?.perms.batteryExempt },
    { key: 'keepaliveChannel', label: '保活通知', ok: !!diag?.perms.keepaliveChannel },
  ];

  const latest = logs[logs.length - 1];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 保活服务 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>保活服务</Text>
          <Text style={{ color: serviceRunning ? '#22b573' : '#ff6b6b', fontWeight: '600' }}>
            {serviceRunning ? '● 运行中' : '● 已停止'}
          </Text>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>上次心跳：{heartbeatText} · 轮询检测中</Text>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>精确闹钟（Doze 唤醒）</Text>
          <Text style={{ color: diag?.canExactAlarms ? '#22b573' : '#ff6b6b' }}>
            {diag?.canExactAlarms ? '✓ 已授权' : '✗ 未授权'}
          </Text>
        </View>
        {!diag?.canExactAlarms && (
          <TouchableOpacity onPress={() => SmsBridge?.openExactAlarmSettings?.()} style={{ marginTop: 6 }}>
            <Text style={{ color: '#4f9eff', fontSize: 12 }}>去授权精确闹钟 →</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>上次服务销毁</Text>
          <Text style={{ color: colors.textSecondary }}>
            {diag && diag.serviceDeadTs > 0
              ? new Date(diag.serviceDeadTs).toLocaleString()
              : !diag || diag.heartbeatTs <= 0
                ? '未启动'
                : serviceRunning
                  ? '无记录'
                  : '进程级被杀（无销毁记录）'}
          </Text>
        </View>
      </View>

      {/* 权限状态 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>权限状态</Text>
        <View style={styles.permGrid}>
          {perms.map((p) => (
            <View key={p.key} style={styles.permItem}>
              <Text style={{ color: colors.text }}>{p.label}</Text>
              <Text style={{ color: p.ok ? '#22b573' : '#ffb020' }}>{p.ok ? '✓ 正常' : '⚠ 未开启'}</Text>
            </View>
          ))}
        </View>
        {!diag?.perms.keepaliveChannel && (
          <TouchableOpacity onPress={() => SmsBridge?.openNotificationSettings?.()} style={{ marginTop: 8 }}>
            <Text style={{ color: '#ff6b6b', fontSize: 12 }}>⚠ 保活通知被关闭，点击去开启 →</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 8 }}>
          <Text style={{ color: '#4f9eff', fontSize: 12 }}>去系统设置 →</Text>
        </TouchableOpacity>
      </View>

      {/* 规则快照 + 最近触发 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: colors.text }}>原生规则快照</Text>
          <Text style={{ color: '#22b573' }}>{diag?.rulesSynced ?? 0} 条已同步</Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>最近触发</Text>
          <Text style={{ color: colors.textSecondary }}>
            {latest ? `${new Date(latest.triggeredAt).toLocaleString()} · ${latest.ruleName}` : '暂无记录'}
          </Text>
        </View>
      </View>

      <Text style={[styles.footnote, { color: colors.textSecondary }]}>
        💡 若某项异常，点击「去系统设置」直达权限设置
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, marginTop: 4 },
  permGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permItem: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
