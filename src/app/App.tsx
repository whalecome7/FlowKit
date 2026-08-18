import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import { registerTriggerModule } from '../modules/trigger';
import RuleListScreen from '../modules/trigger/screens/RuleListScreen';
import RuleEditScreen from '../modules/trigger/screens/RuleEditScreen';
import LogScreen from '../modules/trigger/screens/LogScreen';
import DiagnosticsScreen from '../modules/trigger/screens/DiagnosticsScreen';
import { ThemeProvider, useTheme } from '../theme';
import { navigationRef } from '../modules/trigger/services/NotificationNavigation';

// 注册所有模块
registerTriggerModule();

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
