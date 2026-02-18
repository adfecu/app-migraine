import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Alert, ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { ONBOARDING_COMPLETE_KEY } from '@/app/onboarding';
import { useState } from 'react';

export default function ModalScreen() {
  const colorScheme = useColorScheme();
  const { signOut, deleteAccount } = useAuth();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDebugOnboarding = async () => {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    router.replace('/onboarding');
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente. Se eliminarán todos tus datos, incluyendo check-ins e historial. ¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await deleteAccount();
            setDeleting(false);
            if (error) {
              Alert.alert('Error', 'No se pudo eliminar la cuenta. Intenta de nuevo más tarde.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <EditScreenInfo path="app/modal.tsx" />

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          { backgroundColor: Colors[colorScheme ?? 'light'].tint },
          pressed && styles.logoutButtonPressed,
        ]}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </Pressable>

      <View style={styles.debugSection}>
        <Pressable
          style={({ pressed }) => [styles.debugButton, pressed && styles.debugButtonPressed]}
          onPress={handleDebugOnboarding}
        >
          <Text style={styles.debugButtonText}>Debug: Ver Onboarding</Text>
        </Pressable>
      </View>

      <View style={styles.deleteSection}>
        <Pressable
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
            deleting && styles.deleteButtonDisabled,
          ]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.deleteButtonText}>Eliminar cuenta</Text>
          )}
        </Pressable>
      </View>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  logoutButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  logoutButtonPressed: {
    opacity: 0.8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  debugSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  debugButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7C7CC',
    borderStyle: 'dashed',
  },
  debugButtonPressed: {
    opacity: 0.6,
  },
  debugButtonText: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
  },
  deleteSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  deleteButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    minWidth: 180,
    alignItems: 'center',
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
