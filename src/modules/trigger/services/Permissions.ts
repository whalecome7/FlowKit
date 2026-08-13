import { PermissionsAndroid, Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { create } from 'zustand';
import { isBatteryExempt, requestBatteryExempt } from './SmsBridge';

interface PermissionState {
  smsGranted: boolean;
  notifyGranted: boolean;
  batteryExempt: boolean;
  /** 是否已完成首次权限状态检查（避免首屏闪烁假警告） */
  checked: boolean;
  /** 刷新三个权限的真实状态 */
  refresh: () => Promise<void>;
  /** 请求短信权限（返回是否授予） */
  requestSms: () => Promise<boolean>;
  /** 请求通知权限 */
  requestNotify: () => Promise<boolean>;
  /** 请求电池白名单（系统弹窗，返回是否已豁免） */
  requestBattery: () => Promise<boolean>;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  smsGranted: false,
  notifyGranted: false,
  batteryExempt: false,
  checked: false,

  async refresh() {
    let sms = false;
    if (Platform.OS === 'android') {
      sms = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      );
    }
    const settings = await notifee.getNotificationSettings();
    const notify = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    const battery = await isBatteryExempt();
    set({ smsGranted: sms, notifyGranted: notify, batteryExempt: battery, checked: true });
  },

  async requestSms() {
    if (Platform.OS !== 'android') return false;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );
    const smsGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
    set({ smsGranted, checked: true });
    return smsGranted;
  },

  async requestNotify() {
    const settings = await notifee.requestPermission();
    const notifyGranted = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    set({ notifyGranted, checked: true });
    return notifyGranted;
  },

  async requestBattery() {
    requestBatteryExempt();
    // 等待用户操作后重查
    await new Promise<void>((r) => setTimeout(r, 1500));
    const batteryExempt = await isBatteryExempt();
    set({ batteryExempt });
    return batteryExempt;
  },
}));
