import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Clipboard,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useEmojiStore } from '../store';
import EmojiResultView from '../components/EmojiResultView';
import { renderTokens } from '../services/translator';
import { MAX_INPUT_LENGTH } from '../types';
import type { RenderMode } from '../types';

type Nav = NativeStackNavigationProp<any>;

const MODE_OPTIONS: { key: RenderMode; label: string }[] = [
  { key: 'exact', label: '精确版' },
  { key: 'emoji', label: '纯 emoji 版' },
];

/** emoji 翻译器：输入中文 → 生成双版本 emoji（可点按换候选、复制、看历史） */
export default function EmojiTranslatorScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const {
    input,
    tokens,
    mode,
    picksExact,
    picksEmoji,
    setInput,
    setMode,
    generate,
    cycleCandidate,
    applyHistory,
  } = useEmojiStore();
  const [copied, setCopied] = useState(false);

  // 从历史页回填：有参数则直接生成并清掉参数（防重复触发）
  const routeText: string | undefined = route.params?.text;
  useEffect(() => {
    if (typeof routeText === 'string' && routeText) {
      applyHistory(routeText);
      navigation.setParams({ text: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeText]);

  const picks = mode === 'exact' ? picksExact : picksEmoji;
  const canGenerate = input.trim().length > 0;

  const onGenerate = () => {
    const text = input.trim();
    if (!text) return;
    if (text.length > MAX_INPUT_LENGTH) {
      Alert.alert('文字过长', `最多支持 ${MAX_INPUT_LENGTH} 个字符`);
      return;
    }
    generate();
  };

  const onCopy = () => {
    if (tokens.length === 0) return;
    Clipboard.setString(renderTokens(tokens, mode, picks));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>中文 → emoji</Text>
        <TouchableOpacity onPress={() => navigation.navigate('EmojiHistory')}>
          <Text style={{ color: colors.primary, fontSize: 14 }}>历史记录 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        输入一段话或一首诗，逐字转成谐音 emoji
      </Text>

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
        multiline
        placeholder={'例如：青梅竹马'}
        placeholderTextColor={colors.textMuted}
        value={input}
        onChangeText={setInput}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[
          styles.generateBtn,
          { backgroundColor: colors.primary, opacity: canGenerate ? 1 : 0.4 },
        ]}
        disabled={!canGenerate}
        onPress={onGenerate}>
        <Text style={styles.generateText}>生成</Text>
      </TouchableOpacity>

      {tokens.length > 0 && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.modeRow, { backgroundColor: colors.surfaceAlt }]}>
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={[
                    styles.modeBtn,
                    active && { backgroundColor: colors.primary },
                  ]}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? '#fff' : colors.textSecondary,
                    }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <EmojiResultView tokens={tokens} mode={mode} picks={picks} onPick={cycleCandidate} />

          <TouchableOpacity
            style={[styles.copyBtn, { borderColor: colors.primary }]}
            onPress={onCopy}>
            <Text style={{ color: colors.primary, fontSize: 14 }}>
              {copied ? '已复制 ✓' : '复制'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            点按任意字可切换候选；纯 emoji 版中 ❓ 表示无可用 emoji 的字
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  input: {
    minHeight: 96,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  generateBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { marginTop: 16, borderRadius: 14, padding: 16 },
  modeRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 3,
    marginBottom: 12,
  },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 13 },
  copyBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  hint: { fontSize: 12, marginTop: 10 },
});
