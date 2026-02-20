import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPasswordForEmail } = useAuth();
  const colorScheme = useColorScheme();

  const handleReset = async () => {
    setError('');

    if (!email) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    setLoading(true);
    const { error: resetError } = await resetPasswordForEmail(email);
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(true);
    }
  };

  const inputBackgroundColor = colorScheme === 'dark' ? '#333' : '#f5f5f5';
  const inputTextColor = colorScheme === 'dark' ? '#fff' : '#000';
  const placeholderColor = colorScheme === 'dark' ? '#888' : '#999';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>
        Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña
      </Text>

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

      {success ? (
        <View style={[
          styles.messageContainer,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(27,94,32,0.25)' : '#e8f5e9' },
        ]}>
          <Text style={[
            styles.messageText,
            { color: colorScheme === 'dark' ? '#69f0ae' : '#1b5e20' },
          ]}>
            Revisa tu correo para restablecer tu contraseña
          </Text>
        </View>
      ) : null}

      {!success && (
        <TextInput
          style={[
            styles.input,
            { backgroundColor: inputBackgroundColor, color: inputTextColor },
          ]}
          placeholder="Correo electrónico"
          placeholderTextColor={placeholderColor}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
      )}

      {!success && (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: Colors[colorScheme ?? 'light'].tint },
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Enviar enlace de recuperación</Text>
          )}
        </Pressable>
      )}

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
