import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigateToLog(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('TriggerLog');
  }
}
