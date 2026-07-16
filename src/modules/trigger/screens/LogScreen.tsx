import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTriggerStore } from '../store';

export default function LogScreen() {
  const { logs, loadLogs } = useTriggerStore();

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
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
                <Text
                  key={idx}
                  style={[
                    styles.actionTag,
                    action.success ? styles.actionSuccess : styles.actionFail,
                  ]}>
                  {action.type} {action.success ? '✓' : '✗'}
                </Text>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>暂无触发记录</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16 },
  logCard: {
    backgroundColor: '#fff',
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
  logRuleName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  logTime: { fontSize: 13, color: '#999' },
  logSender: { fontSize: 14, color: '#666', marginBottom: 4 },
  logBody: { fontSize: 14, color: '#888', marginBottom: 8 },
  logActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionTag: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  actionSuccess: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  actionFail: {
    backgroundColor: '#fce4ec',
    color: '#c62828',
  },
  empty: { textAlign: 'center', color: '#999', fontSize: 15, marginTop: 40 },
});
