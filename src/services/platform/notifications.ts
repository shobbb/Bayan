/**
 * Local notifications (REQ-P7): opt-in, scheduled only, never used for
 * engagement nagging — consistent with REQ-15 (no prompting or nagging).
 * One daily reminder; rescheduling replaces it rather than stacking.
 */
import { LocalNotifications } from '@capacitor/local-notifications';

const DAILY_REVIEW_NOTIFICATION_ID = 1;

export async function requestNotificationPermission(): Promise<boolean> {
  const result = await LocalNotifications.requestPermissions();
  return result.display === 'granted';
}

export async function scheduleDailyReviewReminder(hour: number, minute: number): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_REVIEW_NOTIFICATION_ID }] });
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
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_REVIEW_NOTIFICATION_ID }] });
}
