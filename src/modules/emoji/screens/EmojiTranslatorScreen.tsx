import React, { useEffect, useRef, useState } from 'react';
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
    resetEditor,
    resetPicks,
    applyHistory,
  } = useEmojiStore();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 每次从首页进入（Home reset 重建栈 → 新实例 mount）重置为全新状态；
  // 声明顺序必须在回填 effect 之前（popTo 兜底路径同一次提交内两 effect 都执行，
  // 需保证先清空后回填），且不可与回填合并为一个分支 effect：回填后的
  // setParams 清参会让分支再次命中"清空"，把刚生成的内容清掉
  useEffect(() => {
    resetEditor();
  }, [resetEditor]);

  // 从历史页回填：有参数则直接生成并清掉参数（防重复触发）
  const routeText: string | undefined = route.params?.text;
  useEffect(() => {
    if (typeof routeText === 'string' && routeText) {
      applyHistory(routeText);
      navigation.setParams({ text: undefined });
    }
  }, [routeText, applyHistory, navigation]);

  const picks = mode === 'exact' ? picksExact : picksEmoji;
  const canGenerate = input.trim().length > 0;
  // pick 环绕可回到 0，不能用 Boolean 判断"是否有手动选择"
  const hasManualPicks = picks.some((p) => p !== undefined);

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
    clearTimeout(timerRef.current);
    Clipboard.setString(renderTokens(tokens, mode, picks));
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  // 卸载时清理未完成的复制提示定时器，避免对已卸载组件 setState
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

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

      <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          multiline
          placeholder={'例如：青梅竹马'}
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          textAlignVertical="top"
        />
        {input.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={resetEditor}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="清空输入">
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

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

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: colors.border, opacity: hasManualPicks ? 1 : 0.4 },
              ]}
              disabled={!hasManualPicks}
              onPress={resetPicks}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>重置</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.primary }]}
              onPress={onCopy}>
              <Text style={{ color: colors.primary, fontSize: 14 }}>
                {copied ? '已复制 ✓' : '复制'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            点按任意字可切换候选，重置可恢复最初输出；纯 emoji 版中 ❓ 表示无可用 emoji 的字
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
  inputWrap: { borderRadius: 12, marginBottom: 12 },
  input: {
    minHeight: 96,
    borderRadius: 12,
    padding: 12,
    paddingRight: 40,
    fontSize: 16,
  },
  clearBtn: { position: 'absolute', top: 4, right: 4, padding: 8 },
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
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  hint: { fontSize: 12, marginTop: 10 },
});
