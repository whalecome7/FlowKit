import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTriggerStore } from '../store';
import type { TriggerCondition, TriggerAction } from '../types';
import ConditionEditor from '../components/ConditionEditor';
import ActionEditor from '../components/ActionEditor';

type RouteParams = {
  TriggerRuleEdit: { ruleId?: string };
};

export default function RuleEditScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TriggerRuleEdit'>>();
  const { rules, addRule, updateRule } = useTriggerStore();

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
    setActions((prev) => [...prev, { type: 'notify', params: {} }]);
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
        });
      } else {
        await addRule({
          name: name.trim(),
          enabled: true,
          conditions,
          actions,
        });
      }
      navigation.goBack();
    } catch {
      Alert.alert('错误', '保存失败');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>规则名称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：银行验证码"
        placeholderTextColor="#ccc"
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
        <ConditionEditor
          key={index}
          condition={condition}
          onChange={(c) => updateCondition(index, c)}
          onRemove={() => removeCondition(index)}
        />
      ))}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>触发动作</Text>
        <TouchableOpacity onPress={addAction} hitSlop={8}>
          <Text style={styles.addButton}>+ 添加动作</Text>
        </TouchableOpacity>
      </View>
      {actions.length === 0 && <Text style={styles.empty}>尚无动作</Text>}
      {actions.map((action, index) => (
        <ActionEditor
          key={index}
          action={action}
          onChange={(a) => updateAction(index, a)}
          onRemove={() => removeAction(index)}
        />
      ))}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>
          {isEditing ? '更新规则' : '创建规则'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
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
    color: '#888',
  },
  addButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a90d9',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  empty: {
    fontSize: 13,
    color: '#bbb',
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
