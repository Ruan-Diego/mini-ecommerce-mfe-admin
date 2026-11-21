import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { criarEventBus } from '@ruan-diego/mini-event-contracts';
import App from '../App';
import type { PedidoAdmin, StatusPedido } from '../api/pedidos';
import { acoesDoPedido, validarPeriodo, validarRastreio } from '../pedidosAdmin';

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  AGUARDANDO_PAGAMENTO: ['CANCELADO'],
  PAGO: ['EM_SEPARACAO', 'CANCELADO'],
  EM_SEPARACAO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

function pedido(n: number, status: StatusPedido = 'PAGO', extra: Partial<PedidoAdmin> = {}): PedidoAdmin {
  return {
    id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
    clienteId: 'cliente-12345678',
    status,
    transicoesPermitidas: TRANSICOES[status],
    itens: [{ produtoId: 'p1', nome: 'Esfera Chrome', precoUnitario: 100, quantidade: 2, subtotal: 200 }],
    endereco: { destinatario: 'Ana Souza', cep: '01310100', logradouro: 'Av. Paulista', numero: '1000', complemento: null, bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' },
    frete: { codigo: 'padrao', nome: 'Padrão', valor: 19.9, prazoDias: 7 },
    subtotal: 200,
    total: 219.9,
    codigoRastreio: null,
    criadoEm: `2026-11-0${n}T12:00:00Z`,
    atualizadoEm: `2026-11-0${n}T12:00:00Z`,
    ...extra,
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const pagina = (itens: PedidoAdmin[], totalPaginas = 1) => ({ itens, pagina: 0, tamanho: 20, total: itens.length, totalPaginas });

interface Chamada {
  metodo: string;
  url: string;
  corpo?: unknown;
}

interface Cenario {
  lista?: (url: string) => Response;
  status?: (corpo: { status: string; codigoRastreio: string | null }, id: string) => Response;
}

function servidor(cenario: Cenario = {}) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      chamadas.push({ metodo, url, corpo });
      if (metodo === 'PATCH') {
        const id = /pedidos\/([^/]+)\/status/.exec(url)![1];
        return (cenario.status ?? ((c) => json(pedido(1, c.status as StatusPedido, { codigoRastreio: c.codigoRastreio }))))(corpo, id);
      }
      return (cenario.lista ?? (() => json(pagina([pedido(2, 'PAGO'), pedido(1, 'EM_SEPARACAO')]))))(url);
    }),
  );
  return chamadas;
}

function renderizar() {
  render(
    <MemoryRouter initialEntries={['/pedidos']}>
      <App basePath="/" getToken={async () => 'token'} eventBus={criarEventBus(new EventTarget())} />
    </MemoryRouter>,
  );
}

const linhas = (tabela: HTMLElement) => within(tabela).getAllByRole('row').slice(1);

async function abrir(numero: string) {
  const tabela = await screen.findByRole('table', { name: /Pedidos/ });
  await userEvent.click(within(tabela).getByRole('button', { name: `Abrir pedido ${numero}` }));
  return screen.getByRole('complementary', { name: `Pedido ${numero}` });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('Pedidos: lista e filtros', () => {
  it('lista os pedidos com status, total e cliente abreviado', async () => {
    servidor();
    renderizar();

    const tabela = await screen.findByRole('table', { name: /Pedidos/ });
    const l = linhas(tabela);
    expect(l[0]).toHaveTextContent('#00000002');
    expect(l[0]).toHaveTextContent('Pago');
    expect(l[0]).toHaveTextContent('cliente-');
    expect(l[1]).toHaveTextContent('Em separação');
    expect(l[1]).toHaveTextContent('219,90');
  });

  it('filtra por vários status (repetidos na query) e por período, voltando à primeira página', async () => {
    const chamadas = servidor();
    renderizar();
    await screen.findByRole('table', { name: /Pedidos/ });

    await userEvent.click(screen.getByRole('button', { name: 'Pago' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviado' }));
    await userEvent.type(screen.getByLabelText('De'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Até'), '2026-11-30');

    await waitFor(() => {
      const ultima = new URL(chamadas.filter((c) => c.metodo === 'GET').at(-1)!.url, 'http://x');
      expect(ultima.searchParams.getAll('status')).toEqual(['PAGO', 'ENVIADO']);
      expect(ultima.searchParams.get('de')).toBe('2026-11-01');
      expect(ultima.searchParams.get('ate')).toBe('2026-11-30');
      expect(ultima.searchParams.get('pagina')).toBe('0');
    });
    expect(screen.getByRole('button', { name: 'Pago' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('período invertido mostra o erro e não manda as datas ao servidor', async () => {
    const chamadas = servidor();
    renderizar();
    await screen.findByRole('table', { name: /Pedidos/ });

    await userEvent.type(screen.getByLabelText('De'), '2026-11-30');
    await userEvent.type(screen.getByLabelText('Até'), '2026-11-01');

    expect(screen.getByLabelText('Até')).toHaveAccessibleDescription('A data inicial não pode ser depois da final.');
    const ultima = new URL(chamadas.filter((c) => c.metodo === 'GET').at(-1)!.url, 'http://x');
    expect(ultima.searchParams.has('de')).toBe(false);
    expect(ultima.searchParams.has('ate')).toBe(false);
  });

  it('pagina no servidor', async () => {
    const chamadas = servidor({ lista: () => json(pagina([pedido(1)], 2)) });
    renderizar();
    await screen.findByRole('table', { name: /Pedidos/ });

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.includes('pagina=1'))).toBe(true));
  });

  it('vazio, 403 e erro com retry', async () => {
    servidor({ lista: () => json(pagina([])) });
    renderizar();
    expect(await screen.findByText('Nenhum pedido ainda.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pago' }));
    expect(await screen.findByText('Nenhum pedido com esses filtros.')).toBeInTheDocument();
  });

  it('403 vira "Acesso negado"', async () => {
    servidor({ lista: () => json({ detail: 'proibido' }, 403) });
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });

  it('erro mostra alerta e tenta de novo', async () => {
    servidor({ lista: () => json({ detail: 'falhou' }, 500) });
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os pedidos.');
    servidor();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: /Pedidos/ })).toBeInTheDocument();
  });
});

describe('Pedidos: painel lateral e transições', () => {
  it('abre o detalhe ao lado da lista, com itens, entrega e total, e fecha', async () => {
    servidor();
    renderizar();
    const painel = await abrir('#00000002');

    expect(within(painel).getByText(/2 × Esfera Chrome/)).toBeInTheDocument();
    expect(painel).toHaveTextContent('Av. Paulista, 1000');
    expect(painel).toHaveTextContent('219,90');
    await userEvent.click(within(painel).getByRole('button', { name: 'Fechar painel' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('só oferece as transições que o servidor permite (transição inválida não vira botão)', async () => {
    servidor({ lista: () => json(pagina([pedido(1, 'PAGO'), pedido(2, 'EM_SEPARACAO'), pedido(3, 'ENVIADO'), pedido(4, 'ENTREGUE'), pedido(5, 'CANCELADO')])) });
    renderizar();

    const botoes = async (numero: string) => {
      const painel = await abrir(numero);
      return within(painel).queryAllByRole('button').map((b) => b.textContent).filter((t) => !['Fechar painel'].includes(t ?? ''));
    };

    expect(await botoes('#00000001')).toEqual(['Iniciar separação', 'Cancelar pedido']);
    expect(await botoes('#00000002')).toEqual(['Marcar como enviado', 'Cancelar pedido']);
    expect(await botoes('#00000003')).toEqual(['Marcar como entregue']);
    expect(await botoes('#00000004')).toEqual([]);
    expect(screen.getByText('Nenhuma ação disponível para este status.')).toBeInTheDocument();
    expect(await botoes('#00000005')).toEqual([]);
  });

  it('inicia a separação e a lista mostra o status novo', async () => {
    const chamadas = servidor({ status: (c) => json(pedido(2, c.status as StatusPedido)) });
    renderizar();
    const painel = await abrir('#00000002');

    await userEvent.click(within(painel).getByRole('button', { name: 'Iniciar separação' }));

    const tabela = screen.getByRole('table', { name: /Pedidos/ });
    await waitFor(() => expect(linhas(tabela)[0]).toHaveTextContent('Em separação'));
    const patch = chamadas.find((c) => c.metodo === 'PATCH')!;
    expect(patch.corpo).toEqual({ status: 'EM_SEPARACAO', codigoRastreio: null });
    expect(patch.url).toMatch(/\/pedidos\/admin\/pedidos\/00000002-.*\/status$/);
    // As ações do painel acompanham o pedido devolvido pelo servidor.
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: 'Marcar como enviado' })).toBeInTheDocument();
  });

  it('enviar exige o código de rastreio: vazio é recusado na tela, preenchido vai ao servidor', async () => {
    const chamadas = servidor({ status: (c) => json(pedido(1, 'ENVIADO', { codigoRastreio: c.codigoRastreio })) });
    renderizar();
    const painel = await abrir('#00000001');

    await userEvent.click(within(painel).getByRole('button', { name: 'Marcar como enviado' }));
    await userEvent.click(within(painel).getByRole('button', { name: 'Confirmar envio' }));
    expect(within(painel).getByLabelText('Código de rastreio')).toHaveAccessibleDescription('Informe o código de rastreio.');
    expect(chamadas.some((c) => c.metodo === 'PATCH')).toBe(false);

    await userEvent.type(within(painel).getByLabelText('Código de rastreio'), '  BR123456789  ');
    await userEvent.click(within(painel).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() => expect(within(screen.getByRole('complementary')).getByText('BR123456789')).toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'PATCH')!.corpo).toEqual({ status: 'ENVIADO', codigoRastreio: 'BR123456789' });
  });

  it('cancelar pede confirmação e só então chama o servidor', async () => {
    const chamadas = servidor({ status: (c) => json(pedido(2, c.status as StatusPedido)) });
    renderizar();
    const painel = await abrir('#00000002');

    await userEvent.click(within(painel).getByRole('button', { name: 'Cancelar pedido' }));
    expect(within(painel).getByText(/O pagamento será estornado/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'PATCH')).toBe(false);
    await userEvent.click(within(painel).getByRole('button', { name: 'Manter pedido' }));
    expect(chamadas.some((c) => c.metodo === 'PATCH')).toBe(false);

    await userEvent.click(within(painel).getByRole('button', { name: 'Cancelar pedido' }));
    await userEvent.click(within(painel).getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PATCH')?.corpo).toEqual({ status: 'CANCELADO', codigoRastreio: null }));
  });

  it('recusa do servidor (422) mostra o motivo no painel e mantém o status', async () => {
    servidor({ status: () => json({ detail: 'transição de PAGO para ENVIADO não é permitida' }, 422) });
    renderizar();
    const painel = await abrir('#00000002');

    await userEvent.click(within(painel).getByRole('button', { name: 'Iniciar separação' }));

    expect(await within(painel).findByRole('alert')).toHaveTextContent('não é permitida');
    expect(within(screen.getByRole('table', { name: /Pedidos/ })).getAllByText('Pago').length).toBeGreaterThan(0);
  });
});

describe('regras puras dos pedidos', () => {
  it('validarPeriodo e validarRastreio', () => {
    expect(validarPeriodo('2026-11-01', '2026-11-30')).toBeNull();
    expect(validarPeriodo('2026-11-30', '2026-11-01')).toMatch(/inicial/);
    expect(validarPeriodo('', '2026-11-01')).toBeNull();
    expect(validarRastreio('BR1')).toBeNull();
    expect(validarRastreio('   ')).toMatch(/Informe/);
    expect(validarRastreio('x'.repeat(41))).toMatch(/até 40/);
    expect(validarRastreio('x'.repeat(40))).toBeNull();
  });

  it('acoesDoPedido devolve exatamente as transições do servidor (e uma cópia)', () => {
    const p = pedido(1, 'PAGO');
    const acoes = acoesDoPedido(p);
    expect(acoes).toEqual(['EM_SEPARACAO', 'CANCELADO']);
    acoes.push('ENTREGUE');
    expect(p.transicoesPermitidas).toEqual(['EM_SEPARACAO', 'CANCELADO']);
  });
});
