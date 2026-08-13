import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTriggerStore } from '../store';
import { usePermissionStore } from '../services/Permissions';
import SimulateSmsModal from '../components/SimulateSmsModal';

export default function RuleListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { rules, loadRules, toggleRule, deleteRule } = useTriggerStore();
  const [simulateVisible, setSimulateVisible] = useState(false);
  const { smsGranted, notifyGranted, batteryExempt, checked, refresh, requestSms, requestNotify, requestBattery } =
    usePermissionStore();

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    void refresh();
    void requestSms();
    void requestNotify();
  }, [refresh, requestSms, requestNotify]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 8 }}>
          <TouchableOpacity onPress={() => setSimulateVisible(true)}>
            <Text style={{ fontSize: 14, color: '#4a90d9' }}>模拟</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('TriggerLog')}>
            <Text style={{ fontSize: 14, color: '#4a90d9' }}>日志</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('TriggerRuleEdit', {})}>
            <Text style={{ fontSize: 20, color: '#4a90d9' }}>+</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      {checked && (!smsGranted || !notifyGranted || !batteryExempt) && (
        <View style={styles.permissionBar}>
          {!smsGranted && (
            <Text style={styles.permissionText}>⚠️ 缺少短信权限，无法自动触发</Text>
          )}
          {!notifyGranted && (
            <Text style={styles.permissionText}>⚠️ 通知未开启，可能收不到提醒</Text>
          )}
          {!batteryExempt && (
            <TouchableOpacity onPress={() => void requestBattery()}>
              <Text style={styles.permissionAction}>🔋 允许后台运行（防清理）</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('TriggerRuleEdit', { ruleId: item.id })
            }>
            <View style={styles.cardLeft}>
              <Text style={styles.ruleName}>{item.name}</Text>
              <Text style={styles.ruleCond}>
                {item.conditions.length} 个条件 · {item.actions.length} 个动作
              </Text>
            </View>
            <Switch
              value={item.enabled}
              onValueChange={() => toggleRule(item.id)}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>暂无规则，点击右上角添加</Text>
        }
      />
      <SimulateSmsModal
        visible={simulateVisible}
        onClose={() => setSimulateVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardLeft: { flex: 1 },
  ruleName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  ruleCond: { fontSize: 13, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', fontSize: 15, marginTop: 40 },
  permissionBar: {
    backgroundColor: '#fff8e1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffe082',
  },
  permissionText: { fontSize: 13, color: '#b26a00', marginVertical: 2 },
  permissionAction: {
    fontSize: 13,
    color: '#4a90d9',
    fontWeight: '600',
    marginVertical: 2,
  },
});
