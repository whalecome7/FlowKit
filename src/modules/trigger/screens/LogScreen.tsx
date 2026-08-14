import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import { useSmsLogStore } from '../services/SmsLogStore';
import type { SmsRecord } from '../types';

export default function LogScreen() {
  const { logs, loadLogs } = useTriggerStore();
  const { records, load } = useSmsLogStore();
  const [tab, setTab] = useState<'logs' | 'sms'>('logs');
  const { colors } = useTheme();

  useEffect(() => {
    loadLogs();
    void load();
  }, [loadLogs, load]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        list: { padding: 16 },
        logCard: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 16,
          marginBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 1,
        },
        logHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        logRuleName: { fontSize: 16, fontWeight: '600', color: colors.text },
        logTime: { fontSize: 13, color: colors.textMuted },
        logSender: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
        logBody: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
        logActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        actionTag: {
          fontSize: 12,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
          overflow: 'hidden',
        },
        actionSuccess: {
          backgroundColor: colors.success,
          color: '#fff',
        },
        actionFail: {
          backgroundColor: colors.danger,
          color: '#fff',
        },
        empty: {
          textAlign: 'center',
          color: colors.textMuted,
          fontSize: 15,
          marginTop: 40,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(['logs', 'sms'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderBottomWidth: tab === t ? 2 : 0,
              borderBottomColor: colors.primary,
            }}>
            <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontWeight: '500' }}>
              {t === 'logs' ? '触发日志' : '短信记录'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'logs' && (
        <FlatList
          data={[...logs].reverse()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.logCard}>
              <View style={styles.logHeader}>
                <Text style={styles.logRuleName}>{item.ruleName}</Text>
                <Text style={styles.logTime}>{formatDate(item.triggeredAt)}</Text>
              </View>
              <Text style={styles.logSender}>来自: {item.smsSender}</Text>
              <Text style={styles.logBody} numberOfLines={2}>
                {item.smsBody}
              </Text>
              <View style={styles.logActions}>
                {item.actions.map((action, idx) => (
                  <View key={idx} style={{ marginBottom: 2 }}>
                    <Text
                      style={[
                        styles.actionTag,
                        action.success ? styles.actionSuccess : styles.actionFail,
                      ]}>
                      {action.type} {action.success ? '✓' : '✗'}
                    </Text>
                    {!action.success && action.error ? (
                      <Text
                        style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>
                        {action.error}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>暂无触发记录</Text>
          }
        />
      )}
      {tab === 'sms' && (
        <FlatList
          data={[...records].reverse()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }: { item: SmsRecord }) => (
            <View style={styles.logCard}>
              <View style={styles.logHeader}>
                <Text style={styles.logRuleName}>{item.sender || '(未知发件人)'}</Text>
                <Text style={styles.logTime}>{formatDate(item.receivedAt)}</Text>
              </View>
              <Text style={styles.logBody} numberOfLines={2}>{item.body}</Text>
              <View style={styles.logActions}>
                {item.matchedRuleNames.length > 0 ? (
                  <Text style={[styles.actionTag, styles.actionSuccess]}>
                    命中: {item.matchedRuleNames.join(', ')}
                  </Text>
                ) : (
                  <Text style={[styles.actionTag, { backgroundColor: colors.surfaceAlt, color: colors.textSecondary }]}>
                    未命中
                  </Text>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>暂无短信记录</Text>}
        />
      )}
    </View>
  );
}
