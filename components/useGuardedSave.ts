import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

/**
 * Runs a save at most once at a time and reports failures.
 * `save` resolves true only after the save succeeded, so callers navigate away
 * only then; on failure the form stays as it is and an alert explains why.
 */
export function useGuardedSave() {
  const [saving, setSaving] = useState(false);
  // A ref, not state, so taps that land before the next render are also ignored.
  const inFlight = useRef(false);

  const save = useCallback(async (persist: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    try {
      await persist();
      return true;
    } catch {
      Alert.alert(
        'No se pudo guardar',
        'Tus respuestas siguen aquí. Revisa tu conexión e inténtalo de nuevo.',
      );
      setSaving(false);
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { saving, save };
}
