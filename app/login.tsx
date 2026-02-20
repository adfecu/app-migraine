import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const handleLogin = async () => {
    setError('');

    // Validation
    if (!email || !password) {
      setError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    } else {
      // On successful login, navigate to main app
      router.replace('/(tabs)');
    }
  };

  const inputBackgroundColor = colorScheme === 'dark' ? '#333' : '#f5f5f5';
  const inputTextColor = colorScheme === 'dark' ? '#fff' : '#000';
  const placeholderColor = colorScheme === 'dark' ? '#888' : '#999';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar Sesión</Text>
      <Text style={styles.subtitle}>Bienvenido de nuevo</Text>

      {error ? (
        <View style={[
          styles.errorContainer,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(198,40,40,0.25)' : '#ffebee' },
        ]}>
          <Text style={[
            styles.errorText,
            { color: colorScheme === 'dark' ? '#ff8a80' : '#c62828' },
          ]}>{error}</Text>
        </View>
      ) : null}

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

      <TextInput
        style={[
          styles.input,
          { backgroundColor: inputBackgroundColor, color: inputTextColor },
        ]}
        placeholder="Contraseña"
        placeholderTextColor={placeholderColor}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />

      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: Colors[colorScheme ?? 'light'].tint },
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Iniciar Sesión</Text>
        )}
      </Pressable>

      <View style={styles.linkContainer}>
        <Text style={styles.linkText}>¿No tienes cuenta? </Text>
        <Link href="/signup" asChild>
          <Pressable>
            <Text style={[styles.link, { color: Colors[colorScheme ?? 'light'].tint }]}>
              Regístrate
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
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
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
    fontSize: 18,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    backgroundColor: 'transparent',
  },
  linkText: {
    fontSize: 14,
    opacity: 0.7,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
});
