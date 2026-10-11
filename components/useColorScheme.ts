import { useColorScheme as useSystemColorScheme } from 'react-native';

/**
 * 'light' or 'dark'. React Native can also report 'unspecified' or null;
 * both fall back to light so lookups such as Colors[colorScheme] always work.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useSystemColorScheme() === 'dark' ? 'dark' : 'light';
}
