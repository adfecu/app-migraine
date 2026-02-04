import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { migrateToSupabase, needsMigration } from '@/utils/migrateToSupabase';
import { initializeNotifications } from '@/utils/notifications';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [migrationChecked, setMigrationChecked] = useState(false);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);

  // Check and perform data migration when user is authenticated
  useEffect(() => {
    const checkAndMigrate = async () => {
      if (!session || migrationChecked) return;
      
      try {
        const shouldMigrate = await needsMigration();
        if (shouldMigrate) {
          console.log('Starting data migration to Supabase...');
          const result = await migrateToSupabase(false); // Keep local data as backup
          if (result.success) {
            console.log('Migration completed:', {
              checkIns: result.checkInsMigrated,
              clHistory: result.clHistoryMigrated,
              thresholdData: result.thresholdDataMigrated,
              settings: result.settingsMigrated,
            });
          } else {
            console.warn('Migration completed with errors:', result.errors);
          }
        }
      } catch (error) {
        console.error('Migration check failed:', error);
      } finally {
        setMigrationChecked(true);
      }
    };
    
    checkAndMigrate();
  }, [session, migrationChecked]);

  // Initialize notifications when user is authenticated
  useEffect(() => {
    const setupNotifications = async () => {
      if (!session || notificationsInitialized) return;
      
      try {
        await initializeNotifications();
        setNotificationsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };
    
    setupNotifications();
  }, [session, notificationsInitialized]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup';

    if (!session && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (session && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="crisis" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
