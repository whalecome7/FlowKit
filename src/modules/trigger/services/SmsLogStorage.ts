import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SmsRecord } from '../types';

const SMS_LOG_KEY = '@flowkit:trigger:sms-log';

export const SmsLogStorage = {
  async load(): Promise<SmsRecord[]> {
    const raw = await AsyncStorage.getItem(SMS_LOG_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SmsRecord[];
    } catch {
      return [];
    }
  },
  async save(records: SmsRecord[]): Promise<void> {
    const trimmed = records.slice(-500);
    await AsyncStorage.setItem(SMS_LOG_KEY, JSON.stringify(trimmed));
  },
};
