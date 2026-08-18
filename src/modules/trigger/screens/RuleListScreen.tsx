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
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import { exportRules, parseRules, serializeRules } from '../services/RuleExport';
import { RULE_TEMPLATES } from '../services/RuleTemplates';
import { usePermissionStore } from '../services/Permissions';
import SimulateSmsModal from '../components/SimulateSmsModal';
import { QRCodeView } from '../components/QRCodeView';

export default function RuleListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { colors } = useTheme();
  const { rules, loadRules, toggleRule, deleteRule, duplicateRule, addRule } =
    useTriggerStore();
  const [simulateVisible, setSimulateVisible] = useState(false);
  const [templateVisible, setTemplateVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [moreVisible, setMoreVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
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
            onPress={() => setTemplateVisible(true)}>
            <Text style={{ fontSize: 20, color: colors.primary, lineHeight: 20 }}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMoreVisible(true)}>
            <Text style={{ fontSize: 18, color: colors.primary, lineHeight: 20 }}>⋯</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors]);

  const moreItems = [
    {
      label: '模拟短信',
      onPress: () => {
        setMoreVisible(false);
        setSimulateVisible(true);
      },
    },
    {
      label: '触发日志',
      onPress: () => {
        setMoreVisible(false);
        navigation.navigate('TriggerLog');
      },
    },
    {
      label: '自诊断',
      onPress: () => {
        setMoreVisible(false);
        navigation.navigate('TriggerDiagnostics');
      },
    },
    {
      label: '触发统计',
      onPress: () => {
        setMoreVisible(false);
        navigation.navigate('TriggerStatistics');
      },
    },
    {
      label: '导出规则',
      onPress: () => {
        setMoreVisible(false);
        setExportVisible(true);
      },
    },
    {
      label: '导入规则',
      onPress: () => {
        setMoreVisible(false);
        setImportText('');
        setImportVisible(true);
      },
    },
  ];

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
        visible={templateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplateVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
              maxHeight: '85%',
            }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                marginBottom: 12,
                color: colors.text,
              }}>
              新建规则
            </Text>
            <ScrollView>
              <TouchableOpacity
                onPress={() => {
                  setTemplateVisible(false);
                  navigation.navigate('TriggerRuleEdit', {});
                }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: colors.surfaceAlt,
                  marginBottom: 8,
                }}>
                <Text style={{ color: colors.text, fontWeight: '500' }}>
                  ⬜ 空白规则
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  从零开始配置
                </Text>
              </TouchableOpacity>
              {RULE_TEMPLATES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setTemplateVisible(false);
                    navigation.navigate('TriggerRuleEdit', {
                      templateId: t.id,
                    });
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: colors.surfaceAlt,
                    marginBottom: 8,
                  }}>
                  <Text style={{ color: colors.text, fontWeight: '500' }}>
                    {t.icon} {t.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {t.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
              maxHeight: '85%',
            }}>
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
                maxHeight: 280,
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

      {/* 导出规则弹窗：二维码 + 分享/复制 */}
      <Modal
        visible={exportVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
              alignItems: 'center',
            }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                marginBottom: 12,
                color: colors.text,
              }}>
              导出规则
            </Text>
            <QRCodeView value={serializeRules(rules)} />
            <Text
              style={{
                fontSize: 11,
                color: colors.textSecondary,
                marginTop: 8,
                textAlign: 'center',
              }}>
              扫码即导入规则（本地编码，无需联网）
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={async () => {
                  await exportRules(rules);
                }}
                style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>📄 分享/存文件</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('已复制', '规则 JSON 已复制');
                  void exportRules(rules);
                }}
                style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>📋 复制 JSON</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setExportVisible(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 更多操作菜单：底部面板，点空白或 ✕ 关闭 */}
      <Modal
        visible={moreVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreVisible(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setMoreVisible(false)}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 32,
              paddingTop: 10,
            }}>
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                marginBottom: 8,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12 }}>
              <TouchableOpacity onPress={() => setMoreVisible(false)} hitSlop={8} style={{ padding: 4 }}>
                <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
            {moreItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={item.onPress}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 24,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}>
                <Text style={{ fontSize: 15, color: colors.text }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
