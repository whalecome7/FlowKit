import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import type { TriggerCondition, TriggerAction } from '../types';
import { ACTION_META, getActionMeta } from '../types';
import ConditionEditor from '../components/ConditionEditor';
import ActionEditor from '../components/ActionEditor';
import PromptInputModal from '../components/PromptInputModal';

type RouteParams = {
  TriggerRuleEdit: { ruleId?: string };
};

const FIELD_LABELS: Record<TriggerCondition['field'], string> = {
  sender: '发件人',
  body: '正文',
};

const MATCH_LABELS: Record<TriggerCondition['matchType'], string> = {
  contains: '包含',
  equals: '等于',
  regex: '正则',
};

export default function RuleEditScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TriggerRuleEdit'>>();
  const { rules, addRule, updateRule } = useTriggerStore();
  const { colors } = useTheme();

  const ruleId = route.params?.ruleId;
  const existingRule = ruleId ? rules.find((r) => r.id === ruleId) : undefined;
  const isEditing = !!existingRule;

  const [name, setName] = useState(existingRule?.name ?? '');
  const [conditions, setConditions] = useState<TriggerCondition[]>(
    existingRule?.conditions ?? [],
  );
  const [actions, setActions] = useState<TriggerAction[]>(
    existingRule?.actions ?? [],
  );
  const [editing, setEditing] = useState<{
    kind: 'condition' | 'action';
    index: number;
  } | null>(null);
  const [draftCondition, setDraftCondition] =
    useState<TriggerCondition | null>(null);
  const [draftAction, setDraftAction] = useState<TriggerAction | null>(null);
  const [senderWhitelist, setSenderWhitelist] = useState<string[]>(
    existingRule?.senderWhitelist ?? [],
  );
  const [senderBlacklist, setSenderBlacklist] = useState<string[]>(
    existingRule?.senderBlacklist ?? [],
  );
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(
    existingRule?.timeWindow?.enabled ?? true,
  );
  const [timeWindowStart, setTimeWindowStart] = useState(
    existingRule?.timeWindow?.start ?? '08:00',
  );
  const [timeWindowEnd, setTimeWindowEnd] = useState(
    existingRule?.timeWindow?.end ?? '22:00',
  );
  // 手动输入号码弹窗状态
  const [manualTarget, setManualTarget] = useState<
    'whitelist' | 'blacklist' | null
  >(null);
  const [manualInput, setManualInput] = useState('');
  // 时间输入弹窗状态
  const [timeTarget, setTimeTarget] = useState<'start' | 'end' | null>(null);
  const [timeInput, setTimeInput] = useState('');

  const openConditionModal = (index: number) => {
    setDraftCondition({ ...conditions[index] });
    setEditing({ kind: 'condition', index });
  };

  const openActionModal = (index: number) => {
    setDraftAction({ ...actions[index] });
    setEditing({ kind: 'action', index });
  };

  const closeModal = () => {
    setEditing(null);
    setDraftCondition(null);
    setDraftAction(null);
  };

  const confirmCondition = () => {
    if (draftCondition && editing?.kind === 'condition') {
      updateCondition(editing.index, draftCondition);
    }
    closeModal();
  };

  const confirmAction = () => {
    if (draftAction && editing?.kind === 'action') {
      updateAction(editing.index, draftAction);
    }
    closeModal();
  };

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: 'body', matchType: 'contains', value: '' },
    ]);
  };

  const updateCondition = (index: number, condition: TriggerCondition) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? condition : c)),
    );
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const addAction = () => {
    setActions((prev) => [
      ...prev,
      { type: 'notify', params: {}, enabled: true },
    ]);
  };

  const updateAction = (index: number, action: TriggerAction) => {
    setActions((prev) => prev.map((a, i) => (i === index ? action : a)));
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入规则名称');
      return;
    }
    if (conditions.length === 0) {
      Alert.alert('提示', '至少添加一个匹配条件');
      return;
    }
    if (conditions.some((c) => !c.value.trim())) {
      Alert.alert('提示', '请填写所有条件的匹配内容');
      return;
    }

    try {
      if (isEditing && existingRule) {
        await updateRule(existingRule.id, {
          name: name.trim(),
          conditions,
          actions,
          senderWhitelist,
          senderBlacklist,
          timeWindow: {
            enabled: timeWindowEnabled,
            start: timeWindowStart,
            end: timeWindowEnd,
          },
        });
      } else {
        await addRule({
          name: name.trim(),
          enabled: true,
          conditions,
          actions,
          senderWhitelist,
          senderBlacklist,
          timeWindow: {
            enabled: timeWindowEnabled,
            start: timeWindowStart,
            end: timeWindowEnd,
          },
        });
      }
      navigation.goBack();
    } catch {
      Alert.alert('错误', '保存失败');
    }
  };

  const addManualSender = () => {
    const value = manualInput.trim();
    if (!value) {
      Alert.alert('提示', '请输入号码');
      return;
    }
    const current =
      manualTarget === 'whitelist'
        ? senderWhitelist
        : manualTarget === 'blacklist'
          ? senderBlacklist
          : null;
    if (current && current.includes(value)) {
      Alert.alert('提示', '该号码已存在');
      return;
    }
    if (manualTarget === 'whitelist') {
      setSenderWhitelist((prev) => [...prev, value]);
    } else if (manualTarget === 'blacklist') {
      setSenderBlacklist((prev) => [...prev, value]);
    } else {
      return;
    }
    setManualTarget(null);
  };

  const openTimeInput = (target: 'start' | 'end') => {
    setTimeTarget(target);
    setTimeInput(target === 'start' ? timeWindowStart : timeWindowEnd);
  };

  const confirmTimeInput = () => {
    if (!timeTarget) return;
    const value = timeInput.trim();
    const timePattern = /^(\d{1,2}):(\d{2})$/;
    const m = value.match(timePattern);
    if (!m) {
      Alert.alert('提示', '请输入正确时间，如 08:30');
      return;
    }
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) {
      Alert.alert('提示', '时间不合法（时 0-23，分 0-59）');
      return;
    }
    const normalized = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    if (timeTarget === 'start') {
      setTimeWindowStart(normalized);
    } else {
      setTimeWindowEnd(normalized);
    }
    setTimeTarget(null);
  };

  const renderSenderList = (
    title: string,
    list: string[],
    setList: (v: string[]) => void,
    target: 'whitelist' | 'blacklist',
  ) => (
    <View style={styles.filterCard}>
      <Text style={styles.filterTitle}>{title}</Text>
      {list.length === 0 && (
        <Text style={styles.filterHint}>尚未添加号码</Text>
      )}
      <View style={styles.chipWrap}>
        {list.map((item, idx) => (
          <View key={idx} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {item}
            </Text>
            <TouchableOpacity
              onPress={() => setList(list.filter((_, i) => i !== idx))}
              hitSlop={8}>
              <Text style={styles.chipRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() =>
            Alert.alert('提示', '通讯录选择将在后续版本开放')
          }>
          <Text style={styles.addBtnText}>👤 从通讯录选择</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setManualTarget(target);
            setManualInput('');
          }}>
          <Text style={styles.addBtnText}>⌨ 手动输入</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        content: { padding: 16, paddingBottom: 40 },
        sectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 20,
          marginBottom: 10,
        },
        sectionTitle: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.textMuted,
        },
        addButton: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.primary,
        },
        summaryCard: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        summaryText: {
          flex: 1,
          fontSize: 14,
          color: colors.text,
          marginRight: 8,
        },
        summaryTitle: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        summaryMeta: {
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 2,
        },
        summaryStatus: {
          fontSize: 12,
          marginTop: 4,
        },
        remove: {
          fontSize: 16,
          color: colors.danger,
          padding: 4,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          padding: 24,
        },
        modalCard: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 18,
        },
        modalHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        },
        modalTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
          textAlign: 'center',
        },
        modalClose: {
          fontSize: 16,
          color: colors.textMuted,
          padding: 4,
        },
        doneButton: {
          backgroundColor: colors.primary,
          borderRadius: 10,
          padding: 14,
          alignItems: 'center',
          marginTop: 12,
        },
        doneButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
        input: {
          backgroundColor: colors.surface,
          borderRadius: 10,
          padding: 14,
          fontSize: 16,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
        },
        filterCard: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
        },
        filterTitle: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
          marginBottom: 8,
        },
        filterHint: {
          fontSize: 12,
          color: colors.textMuted,
          marginBottom: 10,
        },
        chipWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
        },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceAlt,
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginRight: 8,
          marginBottom: 8,
          maxWidth: '80%',
        },
        chipText: {
          flexShrink: 1,
          fontSize: 13,
          color: colors.text,
          marginRight: 6,
        },
        chipRemove: {
          fontSize: 14,
          color: colors.textMuted,
          padding: 2,
        },
        btnRow: {
          flexDirection: 'row',
          marginTop: 4,
        },
        addBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          marginRight: 8,
        },
        addBtnText: {
          fontSize: 12,
          fontWeight: '500',
          color: colors.primary,
        },
        timeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
        },
        timeBox: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          marginRight: 8,
        },
        timeBoxText: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
          marginRight: 8,
        },
        empty: {
          fontSize: 13,
          color: colors.textMuted,
          marginBottom: 10,
        },
        saveButton: {
          backgroundColor: colors.primary,
          borderRadius: 10,
          padding: 16,
          alignItems: 'center',
          marginTop: 28,
        },
        saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
      }),
    [colors],
  );

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>规则名称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：银行验证码"
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>匹配条件（全部满足）</Text>
        <TouchableOpacity onPress={addCondition} hitSlop={8}>
          <Text style={styles.addButton}>+ 添加条件</Text>
        </TouchableOpacity>
      </View>
      {conditions.length === 0 && (
        <Text style={styles.empty}>尚无条件，添加一个以启用规则</Text>
      )}
      {conditions.map((condition, index) => (
        <TouchableOpacity
          key={index}
          style={styles.summaryCard}
          onPress={() => openConditionModal(index)}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {FIELD_LABELS[condition.field]} ·{' '}
            {MATCH_LABELS[condition.matchType]} · {condition.value || '未填写'}
          </Text>
          {conditions.length > 1 && (
            <TouchableOpacity
              onPress={() => removeCondition(index)}
              hitSlop={8}>
              <Text style={styles.remove}>✕</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>发送人过滤</Text>
      </View>
      <Text style={styles.filterHint}>
        黑名单优先排除；白名单非空时仅限名单内号码
      </Text>
      {renderSenderList(
        '仅限以下发送人',
        senderWhitelist,
        setSenderWhitelist,
        'whitelist',
      )}
      {renderSenderList(
        '排除以下发送人',
        senderBlacklist,
        setSenderBlacklist,
        'blacklist',
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>生效时间窗口</Text>
        <Switch
          value={timeWindowEnabled}
          onValueChange={setTimeWindowEnabled}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {timeWindowEnabled && (
        <>
          <View style={styles.timeRow}>
            <TouchableOpacity
              style={styles.timeBox}
              onPress={() => openTimeInput('start')}>
              <Text style={styles.timeBoxText}>{timeWindowStart}</Text>
            </TouchableOpacity>
            <Text style={styles.timeBoxText}>→</Text>
            <TouchableOpacity
              style={styles.timeBox}
              onPress={() => openTimeInput('end')}>
              <Text style={styles.timeBoxText}>{timeWindowEnd}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.filterHint}>
            窗口外收到的短信完全静默 · 支持跨天（如 22:00 → 08:00）
          </Text>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>触发动作</Text>
        <TouchableOpacity onPress={addAction} hitSlop={8}>
          <Text style={styles.addButton}>+ 添加动作</Text>
        </TouchableOpacity>
      </View>
      {actions.length === 0 && <Text style={styles.empty}>尚无动作</Text>}
      {actions.map((action, index) => {
        const meta = getActionMeta(action.type) ?? ACTION_META[0];
        const actionEnabled = action.enabled !== false;
        const paramSummary = meta.params
          .map((p) => {
            const v = action.params?.[p.key];
            const shown = v != null && String(v) !== '' ? String(v) : '未设置';
            return `${p.label}: ${shown}`;
          })
          .join(' · ');
        return (
          <TouchableOpacity
            key={index}
            style={styles.summaryCard}
            onPress={() => openActionModal(index)}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.summaryTitle}>{meta.label}</Text>
              {paramSummary ? (
                <Text style={styles.summaryMeta}>{paramSummary}</Text>
              ) : null}
              <Text
                style={[
                  styles.summaryStatus,
                  { color: actionEnabled ? colors.primary : colors.textMuted },
                ]}>
                {actionEnabled ? '已启用' : '已停用'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => removeAction(index)}
              hitSlop={8}>
              <Text style={styles.remove}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>
          {isEditing ? '更新规则' : '创建规则'}
        </Text>
      </TouchableOpacity>
    </ScrollView>

    <Modal
      visible={editing?.kind === 'condition'}
      transparent
      animationType="fade"
      onRequestClose={closeModal}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑条件</Text>
            <TouchableOpacity onPress={closeModal} hitSlop={8}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {draftCondition && (
            <ConditionEditor
              condition={draftCondition}
              onChange={(c) => setDraftCondition({ ...c })}
              onRemove={() => {}}
              showDelete={false}
            />
          )}
          <TouchableOpacity style={styles.doneButton} onPress={confirmCondition}>
            <Text style={styles.doneButtonText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal
      visible={editing?.kind === 'action'}
      transparent
      animationType="fade"
      onRequestClose={closeModal}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑动作</Text>
            <TouchableOpacity onPress={closeModal} hitSlop={8}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {draftAction && (
            <ActionEditor
              action={draftAction}
              onChange={(a) => setDraftAction({ ...a })}
              onRemove={() => {}}
              enabled={draftAction.enabled !== false}
              onToggleEnabled={(v) =>
                setDraftAction((prev) =>
                  prev ? { ...prev, enabled: v } : prev,
                )
              }
              showDelete={false}
            />
          )}
          <TouchableOpacity style={styles.doneButton} onPress={confirmAction}>
            <Text style={styles.doneButtonText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    <PromptInputModal
      visible={manualTarget !== null}
      title={manualTarget === 'whitelist' ? '添加白名单号码' : '添加黑名单号码'}
      placeholder="输入号码，如 10086"
      keyboardType="phone-pad"
      value={manualInput}
      onChangeText={setManualInput}
      onConfirm={addManualSender}
      onClose={() => setManualTarget(null)}
    />

    <PromptInputModal
      visible={timeTarget !== null}
      title={timeTarget === 'start' ? '设置开始时间' : '设置结束时间'}
      placeholder="HH:mm，如 08:00"
      keyboardType="numbers-and-punctuation"
      value={timeInput}
      onChangeText={setTimeInput}
      onConfirm={confirmTimeInput}
      onClose={() => setTimeTarget(null)}
      onSubmitEditing={confirmTimeInput}
    />
    </>
  );
}
