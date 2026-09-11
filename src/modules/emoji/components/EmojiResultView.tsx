import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import { displayChar } from '../services/translator';
import type { Token, RenderMode } from '../types';

interface Props {
  tokens: Token[];
  mode: RenderMode;
  picks: (number | undefined)[];
  onPick: (tokenIndex: number) => void;
}

/** 单版本结果渲染：汉字位大字号可点按（切换候选），非汉字原样小字号；按换行分行 */
export default function EmojiResultView({ tokens, mode, picks, onPick }: Props) {
  const { colors } = useTheme();

  const lines = useMemo(() => {
    const result: { token: Token; index: number }[][] = [[]];
    tokens.forEach((token, index) => {
      if (token.char === '\n') {
        result.push([]);
        return;
      }
      result[result.length - 1].push({ token, index });
    });
    return result;
  }, [tokens]);

  return (
    <View>
      {lines.map((line, li) => (
        <View key={li} style={styles.line}>
          {line.length === 0 ? (
            <View style={styles.emptyLine} />
          ) : (
            line.map(({ token, index }) => {
              const isHanzi = token.type === 'hanzi';
              const pressable = isHanzi && token.candidates.length > 0;
              return (
                <TouchableOpacity
                  key={index}
                  disabled={!pressable}
                  onPress={() => onPick(index)}>
                  <Text
                    style={[
                      isHanzi ? styles.emoji : styles.other,
                      { color: colors.text },
                    ]}>
                    {displayChar(token, mode, picks[index])}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 },
  emptyLine: { height: 20 },
  emoji: { fontSize: 28, marginRight: 2 },
  other: { fontSize: 18, marginRight: 2, opacity: 0.7 },
});
