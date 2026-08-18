import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  value: string;
  onChangeText: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** 键盘提交（return 键）时触发，用于时间输入等快捷确认 */
  onSubmitEditing?: () => void;
}

export default function PromptInputModal({
  visible,
  title,
  placeholder,
  keyboardType = 'default',
  value,
  onChangeText,
  onConfirm,
  onClose,
  onSubmitEditing,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          padding: 24,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 18,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        },
        title: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
          textAlign: 'center',
        },
        close: {
          fontSize: 16,
          color: colors.textMuted,
          padding: 4,
        },
        input: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 10,
          padding: 12,
          fontSize: 16,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 12,
        },
        btnRow: {
          flexDirection: 'row',
          marginTop: 4,
        },
        cancelBtn: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          padding: 14,
          alignItems: 'center',
          marginRight: 8,
        },
        cancelBtnText: {
          color: colors.text,
          fontSize: 15,
          fontWeight: '600',
        },
        confirmBtn: {
          flex: 1,
          backgroundColor: colors.primary,
          borderRadius: 10,
          padding: 14,
          alignItems: 'center',
          marginLeft: 8,
        },
        confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
      }),
    [colors],
  );

  // 弹窗关闭时清空输入，避免下次打开残留上次内容
  useEffect(() => {
    if (!visible) onChangeText('');
  }, [visible, onChangeText]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType={keyboardType}
            returnKeyType="done"
            autoFocus
            onSubmitEditing={onSubmitEditing}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmBtnText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
