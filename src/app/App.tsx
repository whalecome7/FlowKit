import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import { registerTriggerModule } from '../modules/trigger';
import RuleListScreen from '../modules/trigger/screens/RuleListScreen';
import RuleEditScreen from '../modules/trigger/screens/RuleEditScreen';
import LogScreen from '../modules/trigger/screens/LogScreen';
import { ThemeProvider } from '../theme';

// 注册所有模块
registerTriggerModule();

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
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
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}
