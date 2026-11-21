import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { criarEventBus } from '@ruan-diego/mini-event-contracts';

afterEach(() => vi.unstubAllGlobals());

describe('mfe-admin', () => {
  it('renderiza a primeira tela a partir do basePath', async () => {
    // O painel busca na montagem; um 500 basta aqui (o comportamento do painel é testado em Painel.test.tsx).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/']}>
        <App basePath="/" getToken={async () => null} eventBus={criarEventBus(new EventTarget())} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Painel');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
