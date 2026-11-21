import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { criarEventBus } from '@ruan-diego/mini-event-contracts';
import App from '../App';
import type { PedidoAdmin, StatusPedido } from '../api/pedidos';

function pedido(n: number, status: StatusPedido = 'PAGO'): PedidoAdmin {
  return {
    id: `${String(n).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    clienteId: 'cliente-1',
    status,
    transicoesPermitidas: [],
    itens: [],
    endereco: { destinatario: 'Ana', cep: '40020000', logradouro: 'Rua Chile', numero: '1', complemento: null, bairro: 'Centro', cidade: 'Salvador', uf: 'BA' },
    frete: { codigo: 'padrao', nome: 'Padrão', valor: 19.9, prazoDias: 5 },
    subtotal: 100,
    total: 119.9,
    codigoRastreio: null,
    criadoEm: `2026-11-${String(n).padStart(2, '0')}T12:00:00Z`,
    atualizadoEm: `2026-11-${String(n).padStart(2, '0')}T12:00:00Z`,
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

interface Respostas {
  pedidos?: () => Response;
  estoque?: () => Response;
  lista?: () => Response;
}

/** Servidor falso: cada rota do painel responde o que o teste mandar (ou o padrão). */
function servidor(respostas: Respostas = {}) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes('/pedidos/admin/indicadores'))
        return (respostas.pedidos ?? (() => json({ dia: '2026-11-21', pedidosHoje: 7, faturamentoDoDia: 1234.5, aguardandoPagamento: 3 })))();
      if (url.includes('/estoque/admin/indicadores')) return (respostas.estoque ?? (() => json({ estoqueBaixo: 2, limite: 5 })))();
      if (url.includes('/pedidos/admin/pedidos'))
        return (respostas.lista ?? (() => json({ itens: [pedido(20), pedido(19, 'ENVIADO')], pagina: 0, tamanho: 10, total: 2, totalPaginas: 1 })))();
      return json({}, 404);
    }),
  );
  return urls;
}

function renderizar() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App basePath="/" getToken={async () => 'token'} eventBus={criarEventBus(new EventTarget())} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('Painel', () => {
  it('mostra os quatro indicadores vindos do pedido-service e do estoque-service', async () => {
    servidor();
    renderizar();

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(indicadores).getByText('Pedidos hoje').parentElement).toHaveTextContent('7');
    expect(within(indicadores).getByText('Pedidos hoje').parentElement).toHaveTextContent('21/11/2026');
    expect(within(indicadores).getByText('Faturamento do dia').parentElement).toHaveTextContent(/1\.234,50/);
    expect(within(indicadores).getByText('Aguardando pagamento').parentElement).toHaveTextContent('3');
    expect(within(indicadores).getByText('Estoque abaixo de 5').parentElement).toHaveTextContent('2');
    expect(within(indicadores).getByRole('link', { name: 'Ver estoque' })).toHaveAttribute('href', '/estoque');
  });

  it('lista os 10 últimos pedidos pedindo a página certa, mais recente primeiro', async () => {
    const urls = servidor();
    renderizar();

    const tabela = await screen.findByRole('table', { name: 'Os 10 pedidos mais recentes' });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas[0]).toHaveTextContent('#00000020');
    expect(linhas[0]).toHaveTextContent('Pago');
    expect(linhas[1]).toHaveTextContent('Enviado');
    expect(urls.some((u) => /\/pedidos\/admin\/pedidos\?(pagina=0&tamanho=10|tamanho=10&pagina=0)$/.test(u))).toBe(true);
    expect(screen.getByRole('link', { name: 'Ver todos os pedidos' })).toHaveAttribute('href', '/pedidos');
  });

  it('sem pedidos mostra o estado vazio e zeros nos indicadores', async () => {
    servidor({
      pedidos: () => json({ dia: '2026-11-21', pedidosHoje: 0, faturamentoDoDia: 0, aguardandoPagamento: 0 }),
      estoque: () => json({ estoqueBaixo: 0, limite: 5 }),
      lista: () => json({ itens: [], pagina: 0, tamanho: 10, total: 0, totalPaginas: 1 }),
    });
    renderizar();

    expect(await screen.findByText('Nenhum pedido ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('403 em qualquer chamada vira "Acesso negado" na tela inteira', async () => {
    servidor({ estoque: () => json({ detail: 'proibido' }, 403) });
    renderizar();

    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument();
  });

  it('outra falha mostra o erro e tenta de novo', async () => {
    servidor({ pedidos: () => json({ detail: 'falhou' }, 500) });
    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o painel.');
    servidor();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Indicadores' })).toBeInTheDocument();
  });

  it('a navegação lateral leva às outras telas', async () => {
    servidor();
    renderizar();
    await screen.findByRole('region', { name: 'Indicadores' });

    const nav = screen.getByRole('navigation', { name: 'Administração' });
    expect(within(nav).getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/produtos');
    expect(within(nav).getByRole('link', { name: 'Estoque' })).toHaveAttribute('href', '/estoque');
    expect(within(nav).getByRole('link', { name: 'Pedidos' })).toHaveAttribute('href', '/pedidos');
  });
});
