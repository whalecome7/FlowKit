import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';

const TEMPLATES = ['未按规定停放', '您的验证码是 123456', '余额不足', '到账提醒'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SimulateSmsModal({ visible, onClose }: Props) {
  const processSms = useTriggerStore((s) => s.processSms);
  const { colors } = useTheme();
  const [sender, setSender] = useState('10086');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          padding: 24,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 20,
        },
        title: {
          fontSize: 17,
          fontWeight: '700',
          color: colors.text,
          marginBottom: 14,
        },
        label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, marginTop: 8 },
        input: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 8,
          padding: 12,
          fontSize: 15,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
        },
        bodyInput: { minHeight: 80, textAlignVertical: 'top' },
        btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
        btn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
        btnCancel: { backgroundColor: colors.surfaceAlt },
        btnSend: { backgroundColor: colors.primary },
        btnDisabled: { opacity: 0.6 },
        btnCancelText: { color: colors.textSecondary, fontWeight: '600' },
        btnSendText: { color: '#fff', fontWeight: '600' },
      }),
    [colors],
  );

  const handleSend = async () => {
    if (!body.trim()) {
      Alert.alert('提示', '请输入短信内容');
      return;
    }
    setSending(true);
    try {
      await processSms(sender.trim() || 'unknown', body.trim());
      Alert.alert('已模拟', '短信已进入匹配流程，可查看触发日志');
      setBody('');
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>模拟短信</Text>
          <Text style={styles.label}>发件人</Text>
          <TextInput
            style={styles.input}
            value={sender}
            onChangeText={setSender}
            placeholder="例如 10086"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.label}>短信内容</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {TEMPLATES.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setBody(t)}
                style={{ backgroundColor: colors.surfaceAlt, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder="例如：您的验证码是 123456"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose}>
              <Text style={styles.btnCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSend, sending && styles.btnDisabled]}
              onPress={handleSend}
              disabled={sending}>
              <Text style={styles.btnSendText}>{sending ? '发送中...' : '发送'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
