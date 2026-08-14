import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import { exportRules, parseRules } from '../services/RuleExport';
import { usePermissionStore } from '../services/Permissions';
import SimulateSmsModal from '../components/SimulateSmsModal';

export default function RuleListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { colors } = useTheme();
  const { rules, loadRules, toggleRule, deleteRule, duplicateRule, addRule } =
    useTriggerStore();
  const [simulateVisible, setSimulateVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
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
          <TouchableOpacity
            onPress={() => navigation.navigate('TriggerRuleEdit', {})}>
            <Text style={{ fontSize: 20, color: colors.primary, lineHeight: 20 }}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={showMoreMenu}>
            <Text style={{ fontSize: 18, color: colors.primary, lineHeight: 20 }}>⋯</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors, rules]);

  const showMoreMenu = () => {
    Alert.alert('更多', undefined, [
      {
        text: '模拟短信',
        onPress: () => setSimulateVisible(true),
      },
      {
        text: '触发日志',
        onPress: () => navigation.navigate('TriggerLog'),
      },
      {
        text: '导出规则',
        onPress: () => void exportRules(rules),
      },
      {
        text: '导入规则',
        onPress: () => {
          setImportText('');
          setImportVisible(true);
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        list: { padding: 16 },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
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
        cardLeft: { flex: 1 },
        ruleName: { fontSize: 16, fontWeight: '600', color: colors.text },
        ruleCond: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
        empty: {
          textAlign: 'center',
          color: colors.textMuted,
          fontSize: 15,
          marginTop: 40,
        },
        permissionBar: {
          backgroundColor: colors.warningBg,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.warning,
        },
        permissionText: { fontSize: 13, color: colors.warning, marginVertical: 2 },
        permissionAction: {
          fontSize: 13,
          color: colors.primary,
          fontWeight: '600',
          marginVertical: 2,
        },
      }),
    [colors],
  );

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
            }
            onLongPress={() => {
              Alert.alert('复制规则', `复制「${item.name}」？`, [
                { text: '取消', style: 'cancel' },
                { text: '复制', onPress: () => void duplicateRule(item.id) },
              ]);
            }}>
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
      <Modal
        visible={importVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImportVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '500',
                color: colors.text,
                marginBottom: 12,
              }}>
              导入规则
            </Text>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              placeholder="粘贴导出的规则 JSON"
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                backgroundColor: colors.surfaceAlt,
                color: colors.text,
                borderRadius: 8,
                padding: 12,
                minHeight: 140,
                textAlignVertical: 'top',
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 16,
              }}>
              <TouchableOpacity onPress={() => setImportVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, padding: 8 }}>
                  取消
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const { error, rules: imported } = parseRules(importText);
                  if (error) {
                    Alert.alert('导入失败', error);
                    return;
                  }
                  if (imported.length === 0) {
                    Alert.alert('导入失败', '未解析到任何规则');
                    return;
                  }
                  for (const r of imported) {
                    await addRule({
                      name: r.name,
                      enabled: r.enabled ?? true,
                      conditions: r.conditions,
                      actions: r.actions,
                    });
                  }
                  setImportVisible(false);
                  Alert.alert('导入成功', `已导入 ${imported.length} 条规则`);
                }}>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 14,
                    fontWeight: '500',
                    padding: 8,
                  }}>
                  导入
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
