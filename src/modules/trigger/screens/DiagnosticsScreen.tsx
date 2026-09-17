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
  lastSmsId: number;
  pendingSmsCount: number;
  rulesOnDisk: number;
  dbMaxId: number;
  fingerprintCount: number;
  contentFingerprintCount: number;
  lastRescanTs: number;
  notifListenerEnabled: boolean;
  notifListenerConnected: boolean;
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

      {/* 短信捕获补漏：进程被杀期间的短信依赖持久化进度补处理 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>短信捕获补漏</Text>
        <View style={styles.rowBetween}>
          <Text style={{ color: colors.text }}>处理进度</Text>
          <Text style={{ color: diag && diag.lastSmsId > 0 ? '#22b573' : '#ffb020' }}>
            {diag && diag.lastSmsId > 0 ? `✓ 已处理至短信 #${diag.lastSmsId}` : '⚠ 尚未初始化'}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>离线待补记</Text>
          <Text style={{ color: diag && diag.pendingSmsCount > 0 ? '#ffb020' : '#22b573' }}>
            {diag && diag.pendingSmsCount > 0
              ? `⚠ ${diag.pendingSmsCount} 条（打开 App 自动补记）`
              : '✓ 无积压'}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>磁盘规则快照</Text>
          <Text
            style={{
              color:
                diag && diag.rulesOnDisk >= 0 && diag.rulesOnDisk === diag.rulesSynced
                  ? '#22b573'
                  : '#ffb020',
            }}
          >
            {diag
              ? `磁盘 ${diag.rulesOnDisk >= 0 ? `${diag.rulesOnDisk} 条` : '无'} · 内存 ${diag.rulesSynced} 条`
              : '—'}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>库内最新短信</Text>
          <Text
            style={{
              color: diag && diag.dbMaxId > 0 && diag.dbMaxId > diag.lastSmsId ? '#ffb020' : '#22b573',
            }}
          >
            {diag && diag.dbMaxId > 0
              ? `#${diag.dbMaxId}${diag.dbMaxId > diag.lastSmsId ? ' · 检测中' : ''}`
              : '—'}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>自愈重扫</Text>
          <Text style={{ color: colors.textSecondary }}>
            {diag && diag.lastRescanTs > 0
              ? `✓ ${Math.max(0, Math.round((Date.now() - diag.lastRescanTs) / 1000))} 秒前（每分钟回看补漏）`
              : '—'}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>通知监听（服务号通路）</Text>
          <Text
            style={{
              color:
                diag && diag.notifListenerConnected
                  ? '#22b573'
                  : diag && diag.notifListenerEnabled
                    ? '#ffb020'
                    : '#ff6b6b',
            }}
          >
            {!diag
              ? '—'
              : diag.notifListenerConnected
                ? '✓ 已连接'
                : diag.notifListenerEnabled
                  ? '⚠ 已授权未连接'
                  : '✗ 未授权'}
          </Text>
        </View>
        {diag && !diag.notifListenerConnected && (
          <TouchableOpacity
            onPress={() => SmsBridge?.openNotificationListenerSettings?.()}
            style={{ marginTop: 6 }}>
            <Text style={{ color: '#ff6b6b', fontSize: 12 }}>
              ⚠ 银行/政务等服务号短信被系统隐藏，必须授权「通知使用权」才能捕获 → 点击去授权
            </Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          💡 进程被系统杀死后，死亡窗口内的新短信会在 App 恢复执行的瞬间自动补触发并记录，不会丢失
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          指纹 {diag?.fingerprintCount ?? 0} · 内容指纹 {diag?.contentFingerprintCount ?? 0}
        </Text>
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
