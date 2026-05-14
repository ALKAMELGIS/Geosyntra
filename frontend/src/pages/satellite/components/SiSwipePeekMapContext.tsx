import { createContext, useContext } from 'react';

/** True on the non-interactive swipe overlay map (omit duplicate chrome like NavigationControl). */
export const SiSwipePeekMapContext = createContext(false);

export function useSiSwipePeekMap() {
  return useContext(SiSwipePeekMapContext);
}
