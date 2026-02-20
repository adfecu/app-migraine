import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

// Password validation utility function
const validatePassword = (password: string): { isValid: boolean; error: string } => {
  if (password.length < 8) {
    return { isValid: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  // Count numbers
  const numberCount = (password.match(/\d/g) || []).length;
  if (numberCount < 2) {
    return { isValid: false, error: 'La contraseña debe contener al menos 2 números' };
  }

  // Check for special symbols
  const specialSymbolRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
  if (!specialSymbolRegex.test(password)) {
    return { isValid: false, error: 'La contraseña debe contener al menos 1 símbolo especial' };
  }

  return { isValid: true, error: '' };
};

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const handleSignUp = async () => {
    setError('');

    // Validation
    if (!email || !password || !confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error);
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(email, password);
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
    } else {
      router.replace('/onboarding');
    }
  };

  const inputBackgroundColor = colorScheme === 'dark' ? '#333' : '#f5f5f5';
  const inputTextColor = colorScheme === 'dark' ? '#fff' : '#000';
  const placeholderColor = colorScheme === 'dark' ? '#888' : '#999';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Cuenta</Text>
      <Text style={styles.subtitle}>Regístrate para comenzar</Text>

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
        autoComplete="new-password"
      />

      {password.length > 0 && (
        <View style={styles.passwordRequirements}>
          <Text style={styles.requirementsTitle}>Requisitos de contraseña:</Text>
          <View style={styles.requirementRow}>
            <Text style={[styles.requirementIcon, password.length >= 8 && styles.requirementMet]}>
              {password.length >= 8 ? '✓' : '✗'}
            </Text>
            <Text style={[styles.requirement, password.length >= 8 && styles.requirementMet]}>
              Mínimo 8 caracteres
            </Text>
          </View>
          <View style={styles.requirementRow}>
            <Text style={[styles.requirementIcon, (password.match(/\d/g) || []).length >= 2 && styles.requirementMet]}>
              {(password.match(/\d/g) || []).length >= 2 ? '✓' : '✗'}
            </Text>
            <Text style={[styles.requirement, (password.match(/\d/g) || []).length >= 2 && styles.requirementMet]}>
              Al menos 2 números
            </Text>
          </View>
          <View style={styles.requirementRow}>
            <Text style={[styles.requirementIcon, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) && styles.requirementMet]}>
              {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? '✓' : '✗'}
            </Text>
            <Text style={[styles.requirement, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) && styles.requirementMet]}>
              Al menos 1 símbolo especial
            </Text>
          </View>
        </View>
      )}

      <TextInput
        style={[
          styles.input,
          { backgroundColor: inputBackgroundColor, color: inputTextColor },
        ]}
        placeholder="Confirmar contraseña"
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
        onPress={handleSignUp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Crear Cuenta</Text>
        )}
      </Pressable>

      <View style={styles.linkContainer}>
        <Text style={styles.linkText}>¿Ya tienes cuenta? </Text>
        <Link href="/login" asChild>
          <Pressable>
            <Text style={[styles.link, { color: Colors[colorScheme ?? 'light'].tint }]}>
              Inicia Sesión
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
  passwordRequirements: {
    marginBottom: 16,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  requirementsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.8,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  requirementIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.5,
    width: 16,
  },
  requirement: {
    fontSize: 11,
    opacity: 0.6,
  },
  requirementMet: {
    opacity: 0.9,
    color: '#4caf50',
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
