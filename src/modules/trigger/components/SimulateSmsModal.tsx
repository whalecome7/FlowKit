import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTriggerStore } from '../store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SimulateSmsModal({ visible, onClose }: Props) {
  const processSms = useTriggerStore((s) => s.processSms);
  const [sender, setSender] = useState('10086');
  const [body, setBody] = useState('');

  const handleSend = async () => {
    if (!body.trim()) {
      Alert.alert('提示', '请输入短信内容');
      return;
    }
    await processSms(sender.trim() || 'unknown', body.trim());
    Alert.alert('已模拟', '短信已进入匹配流程，可查看触发日志');
    setBody('');
    onClose();
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
            placeholderTextColor="#ccc"
            autoCapitalize="none"
          />
          <Text style={styles.label}>短信内容</Text>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder="例如：您的验证码是 123456"
            placeholderTextColor="#ccc"
            multiline
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose}>
              <Text style={styles.btnCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSend]} onPress={handleSend}>
              <Text style={styles.btnSendText}>发送</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
  label: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bodyInput: { minHeight: 80, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCancel: { backgroundColor: '#f0f0f0' },
  btnSend: { backgroundColor: '#4a90d9' },
  btnCancelText: { color: '#555', fontWeight: '600' },
  btnSendText: { color: '#fff', fontWeight: '600' },
});
