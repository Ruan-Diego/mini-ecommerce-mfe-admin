import { createContext, useContext, type ReactNode } from 'react';
import { criarEventBus, type EventBus } from '@ruan-diego/mini-event-contracts';
import type { ObterToken } from './api/http';

interface Admin {
  /** Token do shell (props.getToken): null enquanto não há login. */
  getToken: ObterToken;
  eventBus: EventBus;
}

const Contexto = createContext<Admin>({ getToken: async () => null, eventBus: criarEventBus() });

/** Entrega às telas o que o shell passou ao ./App, sem repassar props tela a tela. */
export function AdminProvider({ getToken, eventBus, children }: Admin & { children: ReactNode }) {
  return <Contexto.Provider value={{ getToken, eventBus }}>{children}</Contexto.Provider>;
}

export const useAdmin = () => useContext(Contexto);
