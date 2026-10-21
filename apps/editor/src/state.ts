import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { Api, ApiSnapshot } from './api.ts';

export const ApiContext = createContext<Api | null>(null);
export const useApi = () => useContext(ApiContext)!;

/** Re-render on every state snapshot or connection change. */
export function useSnapshot(): ApiSnapshot {
  const api = useApi();
  const [s, setS] = useState(api.get());
  useEffect(() => api.subscribe(setS), [api]);
  return s;
}

/** Plain-language text for the error codes commands can return. */
export function errorText(code: string): string {
  const t: Record<string, string> = {
    not_found: 'That item no longer exists. The view has been refreshed.',
    overlap: 'That spot is taken by another button.',
    out_of_grid: "That doesn't fit on the grid. Make the grid bigger or move the button first.",
    no_space: 'The grid is full. Make it bigger to add more buttons.',
    last_profile: 'You need at least one profile.',
    root_folder: "A profile's main folder can't be deleted.",
    invalid: 'Some of those values are not valid.',
    wrong_code: "That code doesn't match the one on the device.",
    not_pending: 'That device is no longer waiting. Ask it to connect again.',
    not_implemented: 'That part of TabbyDeck is not built yet.',
    port_in_use: 'That port is already in use by another app.',
    internal: 'Something went wrong in TabbyDeck. Details are in the Log.',
  };
  return t[code] ?? code;
}
