import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  tip: string;
  feedback: string | null;
  children: React.ReactNode;
}

/** 练习环节容器：说明文案 + 题目内容 + 反馈（练习可反馈重试，正式题不反馈） */
export default function PracticeIntro({ tip, feedback, children }: Props) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={[styles.tipBox, { backgroundColor: colors.warningBg }]}>
        <Text style={[styles.tip, { color: colors.warning }]}>{tip}</Text>
      </View>
      {children}
      <Text style={[styles.feedback, { color: colors.success }]}>{feedback ?? ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tipBox: { borderRadius: 10, padding: 12, marginBottom: 16 },
  tip: { fontSize: 13, lineHeight: 20 },
  feedback: { fontSize: 15, textAlign: 'center', marginTop: 14, minHeight: 22 },
});
