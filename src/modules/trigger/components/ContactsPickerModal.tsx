import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  NativeModules,
  StyleSheet,
} from 'react-native';
import { useState, useEffect } from 'react';

const { ContactsModule } = NativeModules;

export interface ContactEntry {
  name: string;
  phones: string[];
}

/** 号码归一化：与 RuleEngine.normalizePhone 保持一致 */
const norm = (raw: string) => {
  const s = raw.trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('+86') && s.length > 11) return s.slice(3);
  if (s.startsWith('0086') && s.length > 11) return s.slice(4);
  if (s.startsWith('86') && s.length > 11) return s.slice(2);
  return s;
};

/** 通讯录多选弹窗：加载联系人、搜索、多选、返回归一化号码列表 */
export function ContactsPickerModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (numbers: string[]) => void;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setQuery('');
    setLoading(true);
    // 未授权时请求权限后重试
    ContactsModule?.getContacts?.()
      .catch(() =>
        ContactsModule?.requestPermission?.().then(() =>
          ContactsModule?.getContacts?.(),
        ),
      )
      .then((list: ContactEntry[] | null | undefined) => {
        setContacts(list ?? []);
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = contacts.filter(
    (c) => !query || c.name.includes(query) || c.phones.some((p) => p.includes(query)),
  );

  const toggle = (number: string) => {
    const n = norm(number);
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>从通讯录选择</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索姓名或号码"
            style={styles.search}
          />
          {loading && <Text style={styles.hint}>加载中…</Text>}
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => item.phones.forEach((p) => toggle(p))}
                style={styles.item}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPhones}>{item.phones.join(' / ')}</Text>
              </TouchableOpacity>
            )}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onConfirm(selected);
                onClose();
              }}>
              <Text style={styles.confirm}>确定（{selected.length}）</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '85%' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  search: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10 },
  hint: { color: '#888', fontSize: 12, marginBottom: 8 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  itemName: { fontWeight: '500', fontSize: 14 },
  itemPhones: { color: '#888', fontSize: 12, marginTop: 2 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  cancel: { padding: 8, color: '#666', fontSize: 14 },
  confirm: { padding: 8, color: '#4f9eff', fontWeight: '600', fontSize: 14 },
});
