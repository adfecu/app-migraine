import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

let _handlerInstalled = false;

/**
 * Installs the foreground notification handler.
 * Deferred from module-level to avoid a TurboModule void-method call
 * during JS bundle initialization, which can race with Hermes on iOS.
 */
function ensureNotificationHandler() {
  if (_handlerInstalled) return;
  _handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Notification identifier for the daily check-in reminder
const DAILY_CHECKIN_NOTIFICATION_ID = 'daily-checkin-reminder';

/**
 * Request notification permissions from the user
 * @returns Promise resolving to the permission status
 */
export async function requestNotificationPermissions(): Promise<Notifications.NotificationPermissionsStatus> {
  ensureNotificationHandler();
  try {
    const existingPermissions = await Notifications.getPermissionsAsync();

    if (existingPermissions.status !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      return requestedPermissions;
    }

    return existingPermissions;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    // Return permissions from getPermissionsAsync as fallback (should always work)
    try {
      return await Notifications.getPermissionsAsync();
    } catch {
      // Last resort: return a properly typed denied status
      return {
        status: PermissionStatus.DENIED as Notifications.PermissionStatus,
        granted: false,
        expires: 'never' as const,
        canAskAgain: false,
      };
    }
  }
}

/**
 * Check if notification permissions are granted
 * @returns Promise resolving to true if permissions are granted
 */
export async function hasNotificationPermissions(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking notification permissions:', error);
    return false;
  }
}

/**
 * Cancel the daily check-in notification
 */
export async function cancelDailyCheckinNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_CHECKIN_NOTIFICATION_ID);
  } catch (error) {
    console.error('Error canceling daily check-in notification:', error);
  }
}

/**
 * Schedule a daily check-in notification at the specified time.
 * @param hour Hour in 24-hour format (default 8)
 * @param minute Minute (default 0)
 * @returns Promise resolving to the notification identifier, or null if scheduling failed
 */
export async function scheduleDailyCheckinNotification(hour = 8, minute = 0): Promise<string | null> {
  ensureNotificationHandler();
  try {
    // Check if we have permissions first
    const hasPermissions = await hasNotificationPermissions();
    if (!hasPermissions) {
      console.warn('Notification permissions not granted. Cannot schedule daily check-in notification.');
      return null;
    }

    // Cancel any existing notification with the same ID
    await cancelDailyCheckinNotification();

    const pad = (n: number) => String(n).padStart(2, '0');
    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: DAILY_CHECKIN_NOTIFICATION_ID,
      content: {
        title: 'Recordatorio de Check-in',
        body: '¡Hora de hacer tu check-in diario!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: 'daily',
        hour,
        minute,
        repeats: true,
      } as Notifications.DailyTriggerInput,
    });

    console.log(`Daily check-in notification scheduled for ${pad(hour)}:${pad(minute)}:`, notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily check-in notification:', error);
    return null;
  }
}

/**
 * Initialize notifications: request permissions and schedule daily notification
 * This should be called when the app starts and user is authenticated
 */
export async function initializeNotifications(): Promise<void> {
  ensureNotificationHandler();
  try {
    // Request permissions
    const permissionStatus = await requestNotificationPermissions();

    if (permissionStatus.status === 'granted') {
      // Schedule the daily notification
      await scheduleDailyCheckinNotification();
    } else {
      console.warn('Notification permissions not granted. Daily check-in reminder will not be scheduled.');
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}
