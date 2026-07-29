/**
 * Local notifications (REQ-P7): opt-in, scheduled only, never used for
 * engagement nagging — consistent with REQ-15 (no prompting or nagging).
 * One daily reminder; rescheduling replaces it rather than stacking.
 *
 * The plugin has no web implementation, so every entry point reports
 * unavailability instead of throwing. The hosted build is a test surface
 * (REQ-P1), and a Settings screen that breaks in a browser is worse than one
 * that says plainly the feature needs the native app.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const DAILY_REVIEW_NOTIFICATION_ID = 1;

export interface DailyReminder {
  enabled: boolean;
  /** Local time, 24-hour. */
  hour: number;
  minute: number;
}

/** Off by default (§13). */
export const DEFAULT_DAILY_REMINDER: DailyReminder = { enabled: false, hour: 19, minute: 0 };

/** False in a browser: iOS and Android schedule these, a web build cannot. */
export function notificationsAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsAvailable()) return false;
  const result = await LocalNotifications.requestPermissions();
  return result.display === 'granted';
}

export async function scheduleDailyReviewReminder(hour: number, minute: number): Promise<void> {
  if (!notificationsAvailable()) return;
  await cancelDailyReviewReminder();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_REVIEW_NOTIFICATION_ID,
        title: 'Bayan',
        body: 'Cards are due for review.',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      },
    ],
  });
}

export async function cancelDailyReviewReminder(): Promise<void> {
  if (!notificationsAvailable()) return;
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_REVIEW_NOTIFICATION_ID }] });
}

/**
 * Brings the OS schedule in line with a stored preference. Returns false when
 * the reminder could not be armed — no native platform, or permission refused.
 *
 * Called on save and at startup: the OS drops scheduled notifications when an
 * app is reinstalled, so the stored preference is the source of truth and the
 * schedule is derived from it rather than the other way round.
 */
export async function applyDailyReminder(reminder: DailyReminder): Promise<boolean> {
  if (!notificationsAvailable()) return false;
  if (!reminder.enabled) {
    await cancelDailyReviewReminder();
    return true;
  }
  if (!(await requestNotificationPermission())) return false;
  await scheduleDailyReviewReminder(reminder.hour, reminder.minute);
  return true;
}
