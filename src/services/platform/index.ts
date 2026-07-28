/**
 * The only Capacitor import site (REQ-P5). Domain and UI never import
 * Capacitor directly — everything goes through this module, which keeps the
 * browser dev loop (REQ-P1) working without native shims (these calls are
 * no-ops or web fallbacks outside a native shell).
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export * as secureStorage from './storage';
export * as notifications from './notifications';
export * as exportFiles from './files';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** REQ-P6: safe-area and theme handling. */
export async function configureStatusBar(dark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
}

type HapticIntensity = 'light' | 'medium' | 'heavy';

const HAPTIC_STYLES: Record<HapticIntensity, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Drill answer feedback (§10.5 — colour change plus haptic, no bounce/scale/confetti). */
export async function hapticFeedback(intensity: HapticIntensity = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Haptics.impact({ style: HAPTIC_STYLES[intensity] });
}
