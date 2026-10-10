import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { useGuardedSave } from '../useGuardedSave';

let hook: ReturnType<typeof useGuardedSave>;
function Harness() {
  hook = useGuardedSave();
  return null;
}

describe('useGuardedSave', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => {
      renderer.create(<Harness />);
    });
  });
  afterEach(() => alertSpy.mockRestore());

  it('runs one save when the button is tapped repeatedly', async () => {
    let finish!: () => void;
    const persist = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = hook.save(persist);
      second = hook.save(persist);
    });
    expect(hook.saving).toBe(true);

    await act(async () => {
      finish();
    });
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });

  it('reports a failed save, does not signal success, and allows a retry', async () => {
    const failing = jest.fn(() => Promise.reject(new Error('network')));
    let result!: boolean;
    await act(async () => {
      result = await hook.save(failing);
    });
    expect(result).toBe(false);
    expect(hook.saving).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('No se pudo guardar', expect.stringContaining('siguen aquí'));

    const succeeding = jest.fn(() => Promise.resolve());
    await act(async () => {
      result = await hook.save(succeeding);
    });
    expect(result).toBe(true);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
