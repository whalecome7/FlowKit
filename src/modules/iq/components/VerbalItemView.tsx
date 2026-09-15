import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import { buildVerbalPrompt } from '../services/texts';
import { speakText } from '../services/tts';
import type { VerbalItem } from '../types';

interface Props {
  item: VerbalItem;
  onSelect: (optionIndex: number) => void;
  /** 已选选项索引（练习高亮用） */
  selected?: number | null;
  /** 显示朗读按钮（6–8 岁自动朗读外，其余年龄档提供手动朗读） */
  showSpeaker?: boolean;
}

/** 言语类比题：A : B ＝ C : ?（含可选朗读按钮） */
export default function VerbalItemView({ item, onSelect, selected, showSpeaker }: Props) {
  const { colors } = useTheme();
  const prompt = buildVerbalPrompt(item.a, item.b, item.c);

  return (
    <View>
      <View style={styles.promptRow}>
        <Text style={[styles.prompt, { color: colors.text }]}>
          {item.a} : {item.b} ＝ {item.c} : ?
        </Text>
        {showSpeaker && (
          <TouchableOpacity
            onPress={() => speakText(prompt)}
            style={[styles.speaker, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 18 }}>🔊</Text>
          </TouchableOpacity>
        )}
      </View>
      {item.options.map((option, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onSelect(i)}
          style={[
            styles.option,
            {
              borderColor: selected === i ? colors.primary : colors.border,
              borderWidth: selected === i ? 2 : 1,
              backgroundColor: colors.surface,
            },
          ]}>
          <Text style={[styles.optionText, { color: colors.text }]}>{option}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  prompt: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  speaker: { marginLeft: 12, borderWidth: 1, borderRadius: 18, padding: 8 },
  option: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  optionText: { fontSize: 17 },
});
