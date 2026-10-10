import { assertSupabaseConfig, isLocalSupabaseUrl } from '../supabaseConfig';

describe('isLocalSupabaseUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://10.0.2.2:54321',
    'http://192.168.0.170:54321',
    'http://127.0.0.1:54321/',
  ])('treats %s as local', url => {
    expect(isLocalSupabaseUrl(url)).toBe(true);
  });

  it.each([
    'https://bnflsokqzaoxmwhzrpwv.supabase.co',
    'https://localhost.example.com',
    'https://api.example.com/127.0.0.1',
  ])('treats %s as hosted', url => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });
});

describe('assertSupabaseConfig', () => {
  const HOSTED = 'https://bnflsokqzaoxmwhzrpwv.supabase.co';

  it.each([
    ['', 'key'],
    [HOSTED, ''],
    ['  ', 'key'],
  ])('blocks a build with missing settings (url=%j, key=%j)', (url, key) => {
    expect(() => assertSupabaseConfig(url, key, false)).toThrow(/no Supabase configuration/);
    expect(() => assertSupabaseConfig(url, key, true)).toThrow(/no Supabase configuration/);
  });

  it('blocks a release build that points at a local server', () => {
    expect(() => assertSupabaseConfig('http://127.0.0.1:54321', 'key', false)).toThrow(/local Supabase server/);
  });

  it('allows local servers in development builds', () => {
    expect(() => assertSupabaseConfig('http://127.0.0.1:54321', 'key', true)).not.toThrow();
  });

  it('allows hosted projects in release builds', () => {
    expect(() => assertSupabaseConfig(HOSTED, 'key', false)).not.toThrow();
  });
});
