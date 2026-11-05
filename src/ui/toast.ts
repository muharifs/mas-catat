import { Platform, ToastAndroid } from 'react-native';

/**
 * Short success message at the bottom of the screen. ToastAndroid is Android-only (the app targets Android);
 * on other platforms (tests, web) it does nothing. On the web you would render a snackbar component instead.
 */
export function toast(message: string): void {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}
