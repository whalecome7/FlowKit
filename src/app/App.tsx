import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import { registerTriggerModule } from '../modules/trigger';
import { registerReactionModule } from '../modules/reaction';
import { registerEmojiModule } from '../modules/emoji';
import ReactionHome from '../modules/reaction/screens/ReactionHome';
import ReactionGame from '../modules/reaction/screens/ReactionGame';
import ReactionResult from '../modules/reaction/screens/ReactionResult';
import EmojiTranslatorScreen from '../modules/emoji/screens/EmojiTranslatorScreen';
import EmojiHistoryScreen from '../modules/emoji/screens/EmojiHistoryScreen';
import RuleListScreen from '../modules/trigger/screens/RuleListScreen';
import RuleEditScreen from '../modules/trigger/screens/RuleEditScreen';
import LogScreen from '../modules/trigger/screens/LogScreen';
import DiagnosticsScreen from '../modules/trigger/screens/DiagnosticsScreen';
import StatisticsScreen from '../modules/trigger/screens/StatisticsScreen';
import { ThemeProvider, useTheme } from '../theme';
import { navigationRef } from '../modules/trigger/services/NotificationNavigation';

// 注册所有模块
registerTriggerModule();
registerReactionModule();
registerEmojiModule();

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { colors } = useTheme();
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TriggerRuleList"
          component={RuleListScreen}
          options={{ title: '规则列表' }}
        />
        <Stack.Screen
          name="TriggerRuleEdit"
          component={RuleEditScreen}
          options={{ title: '编辑规则' }}
        />
        <Stack.Screen
          name="TriggerLog"
          component={LogScreen}
          options={{ title: '触发日志' }}
        />
        <Stack.Screen
          name="TriggerDiagnostics"
          component={DiagnosticsScreen}
          options={{ title: '自诊断' }}
        />
        <Stack.Screen
          name="TriggerStatistics"
          component={StatisticsScreen}
          options={{ title: '触发统计' }}
        />
        <Stack.Screen
          name="ReactionHome"
          component={ReactionHome}
          options={{ title: '反应力测试' }}
        />
        <Stack.Screen
          name="ReactionGame"
          component={ReactionGame}
          options={{ title: '反应力测试' }}
        />
        <Stack.Screen
          name="ReactionResult"
          component={ReactionResult}
          options={{ title: '测试结果' }}
        />
        <Stack.Screen
          name="EmojiTranslator"
          component={EmojiTranslatorScreen}
          options={{ title: 'emoji 翻译器' }}
        />
        <Stack.Screen
          name="EmojiHistory"
          component={EmojiHistoryScreen}
          options={{ title: '历史记录' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}
