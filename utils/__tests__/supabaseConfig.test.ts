import { assertReleaseSupabaseUrl, isLocalSupabaseUrl } from '../supabaseConfig';

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

describe('assertReleaseSupabaseUrl', () => {
  it('blocks a release build that points at a local server', () => {
    expect(() => assertReleaseSupabaseUrl('http://127.0.0.1:54321', false)).toThrow(/local Supabase server/);
  });

  it('allows local servers in development builds', () => {
    expect(() => assertReleaseSupabaseUrl('http://127.0.0.1:54321', true)).not.toThrow();
  });

  it('allows hosted projects in release builds', () => {
    expect(() => assertReleaseSupabaseUrl('https://bnflsokqzaoxmwhzrpwv.supabase.co', false)).not.toThrow();
  });
});
