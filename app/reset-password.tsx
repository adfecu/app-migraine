import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';

const validatePassword = (password: string): { isValid: boolean; error: string } => {
  if (password.length < 8) {
    return { isValid: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }
  const numberCount = (password.match(/\d/g) || []).length;
  if (numberCount < 2) {
    return { isValid: false, error: 'La contraseña debe contener al menos 2 números' };
  }
  const specialSymbolRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
  if (!specialSymbolRegex.test(password)) {
    return { isValid: false, error: 'La contraseña debe contener al menos 1 símbolo especial' };
  }
  return { isValid: true, error: '' };
};

export default function ResetPasswordScreen() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { updatePassword } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  // useLinkingURL also returns a link that arrived while the app was running;
  // useURL misses it because this screen mounts after the link event fires.
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (!url) return;

    const createSessionFromUrl = async (deepLinkUrl: string) => {
      const { params, errorCode } = QueryParams.getQueryParams(deepLinkUrl);

      if (errorCode) {
        setSessionError('El enlace de recuperación no es válido o ha expirado');
        return;
      }

      const { access_token, refresh_token } = params;
      if (!access_token) return;

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token ?? '',
      });

      if (sessionErr) {
        setSessionError('El enlace de recuperación no es válido o ha expirado');
      } else {
        setSessionReady(true);
      }
    };

    createSessionFromUrl(url);
  }, [url]);

  const handleUpdatePassword = async () => {
    setError('');

    if (!password || !confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 2000);
    }
  };

  const inputBackgroundColor = colorScheme === 'dark' ? '#333' : '#f5f5f5';
  const inputTextColor = colorScheme === 'dark' ? '#fff' : '#000';
  const placeholderColor = colorScheme === 'dark' ? '#888' : '#999';

  if (sessionError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enlace inválido</Text>
        <View style={[
          styles.messageContainer,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(198,40,40,0.25)' : '#ffebee' },
        ]}>
          <Text style={[
            styles.messageText,
            { color: colorScheme === 'dark' ? '#ff8a80' : '#c62828' },
          ]}>{sessionError}</Text>
        </View>
        <View style={styles.linkContainer}>
          <Link href="/forgot-password" asChild>
            <Pressable>
              <Text style={[styles.link, { color: Colors[colorScheme ?? 'light'].tint }]}>
                Solicitar un nuevo enlace
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  if (!url && !sessionReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Restablecer Contraseña</Text>
        <Text style={styles.subtitle}>
          Usa el enlace del correo para restablecer tu contraseña
        </Text>
        <View style={styles.linkContainer}>
          <Link href="/login" asChild>
            <Pressable>
              <Text style={[styles.link, { color: Colors[colorScheme ?? 'light'].tint }]}>
                Volver al inicio de sesión
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>¡Contraseña actualizada!</Text>
        <View style={[
          styles.messageContainer,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(27,94,32,0.25)' : '#e8f5e9' },
        ]}>
          <Text style={[
            styles.messageText,
            { color: colorScheme === 'dark' ? '#69f0ae' : '#1b5e20' },
          ]}>
            Tu contraseña ha sido actualizada correctamente. Redirigiendo...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nueva Contraseña</Text>
      <Text style={styles.subtitle}>Ingresa tu nueva contraseña</Text>

      {error ? (
        <View style={[
          styles.messageContainer,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(198,40,40,0.25)' : '#ffebee' },
        ]}>
          <Text style={[
            styles.messageText,
            { color: colorScheme === 'dark' ? '#ff8a80' : '#c62828' },
          ]}>{error}</Text>
        </View>
      ) : null}

      <TextInput
        style={[
          styles.input,
          { backgroundColor: inputBackgroundColor, color: inputTextColor },
        ]}
        placeholder="Nueva contraseña"
        placeholderTextColor={placeholderColor}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      <TextInput
        style={[
          styles.input,
          { backgroundColor: inputBackgroundColor, color: inputTextColor },
        ]}
        placeholder="Confirmar nueva contraseña"
        placeholderTextColor={placeholderColor}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: Colors[colorScheme ?? 'light'].tint },
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleUpdatePassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Actualizar contraseña</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  messageContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  messageText: {
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    backgroundColor: 'transparent',
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
});
