import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { criarEventBus } from '@ruan-diego/mini-event-contracts';
import App from '../App';
import type { Produto } from '../api/catalogo';
import type { ItemEstoque } from '../api/estoque';
import { aplicarItem, filtrarLinhas, montarLinhas, saldoDepois, validarAjuste } from '../estoque';

function produto(n: number, extra: Partial<Produto> = {}): Produto {
  return {
    id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
    sku: `ESF-0${n}`,
    nome: `Esfera ${n}`,
    slug: `esfera-${n}`,
    descricao: '',
    preco: 100,
    imagens: [],
    categoriaId: 'c1',
    ativo: true,
    ...extra,
  };
}

function item(n: number, disponivel: number, reservado = 0): ItemEstoque {
  return { produtoId: produto(n).id, disponivel, reservado, emEstoque: disponivel > 0, estoqueBaixo: disponivel < 5 };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

interface Chamada {
  metodo: string;
  url: string;
  corpo?: unknown;
}

interface Cenario {
  produtos?: Produto[];
  itens?: ItemEstoque[];
  ajuste?: (corpo: { tipo: string; quantidade: number }) => Response;
  indicadores?: () => Response;
}

/** Gateway falso: catálogo (produtos), estoque (lista, indicadores, ajuste). */
function servidor(cenario: Cenario = {}) {
  const chamadas: Chamada[] = [];
  const produtos = cenario.produtos ?? [produto(1), produto(2), produto(3), produto(4, { ativo: false })];
  const itens = cenario.itens ?? [item(1, 50, 2), item(2, 3), item(3, 0)];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      chamadas.push({ metodo, url, corpo });
      if (url.includes('/catalogo/admin/produtos'))
        return json({ itens: produtos, pagina: 0, tamanho: 100, total: produtos.length, totalPaginas: 1 });
      if (url.includes('/estoque/admin/indicadores')) return (cenario.indicadores ?? (() => json({ estoqueBaixo: 3, limite: 5 })))();
      if (metodo === 'POST' && url.includes('/ajustes'))
        return (cenario.ajuste ?? (() => json({ ...item(2, 8), reservado: 0 })))(corpo as { tipo: string; quantidade: number });
      if (url.includes('/estoque/admin/estoque')) return json(itens);
      return json({}, 404);
    }),
  );
  return chamadas;
}

function renderizar() {
  render(
    <MemoryRouter initialEntries={['/estoque']}>
      <App basePath="/" getToken={async () => 'token'} eventBus={criarEventBus(new EventTarget())} />
    </MemoryRouter>,
  );
}

const linhas = (tabela: HTMLElement) => within(tabela).getAllByRole('row').slice(1);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('Estoque: lista', () => {
  it('junta produto e saldo, do menor saldo para o maior, com a situação de cada um', async () => {
    servidor();
    renderizar();

    const tabela = await screen.findByRole('table', { name: 'Estoque por produto' });
    const l = linhas(tabela);
    expect(l).toHaveLength(4);
    // Menor saldo primeiro: Esfera 3 (0), Esfera 4 (sem cadastro = 0, desativado), Esfera 2 (3), Esfera 1 (50).
    expect(l[0]).toHaveTextContent('Esfera 3');
    expect(l[0]).toHaveTextContent('Esgotado');
    expect(l[1]).toHaveTextContent('Esfera 4 (desativado)');
    expect(l[1]).toHaveTextContent('Sem estoque cadastrado');
    expect(l[2]).toHaveTextContent('Esfera 2');
    expect(l[2]).toHaveTextContent('Estoque baixo');
    expect(l[3]).toHaveTextContent('Esfera 1');
    expect(l[3]).toHaveTextContent('50');
    expect(l[3]).toHaveTextContent('Ok');
    expect(within(l[3]).getAllByRole('cell')[2]).toHaveTextContent('2'); // reservado
  });

  it('"Abaixo de 5" mostra só o que o estoque-service marca como baixo, com a contagem no chip', async () => {
    servidor();
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Estoque por produto' });

    await userEvent.click(screen.getByRole('button', { name: 'Abaixo de 5 (3)' }));
    expect(screen.getByRole('button', { name: 'Abaixo de 5 (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(linhas(tabela).map((l) => l.textContent)).not.toContain(expect.stringContaining('Esfera 1'));
    expect(linhas(tabela)).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(linhas(tabela)).toHaveLength(4);
  });

  it('busca por nome ou SKU, sem diferenciar acento e maiúscula', async () => {
    servidor({ produtos: [produto(1, { nome: 'Esfera Íris' }), produto(2)], itens: [item(1, 9), item(2, 9)] });
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Estoque por produto' });

    await userEvent.type(screen.getByLabelText('Buscar por nome ou SKU'), 'iris');
    expect(linhas(tabela)).toHaveLength(1);
    expect(linhas(tabela)[0]).toHaveTextContent('Esfera Íris');

    await userEvent.clear(screen.getByLabelText('Buscar por nome ou SKU'));
    await userEvent.type(screen.getByLabelText('Buscar por nome ou SKU'), 'esf-02');
    expect(linhas(tabela)[0]).toHaveTextContent('Esfera 2');
  });

  it('filtro sem resultado e catálogo vazio mostram o estado vazio', async () => {
    servidor({ produtos: [produto(1)], itens: [item(1, 50)], indicadores: () => json({ estoqueBaixo: 0, limite: 5 }) });
    renderizar();
    await screen.findByRole('table', { name: 'Estoque por produto' });
    await userEvent.click(screen.getByRole('button', { name: 'Abaixo de 5 (0)' }));
    expect(screen.getByText('Nenhum produto abaixo de 5.')).toBeInTheDocument();
  });

  it('403 vira "Acesso negado"', async () => {
    servidor({ indicadores: () => json({ detail: 'proibido' }, 403) });
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });

  it('erro mostra alerta com tentar de novo', async () => {
    servidor({ indicadores: () => json({ detail: 'falhou' }, 500) });
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o estoque.');
    servidor();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Estoque por produto' })).toBeInTheDocument();
  });
});

describe('Estoque: ajuste com motivo', () => {
  async function abrirAjuste(nome: string) {
    const tabela = await screen.findByRole('table', { name: 'Estoque por produto' });
    await userEvent.click(within(tabela).getByRole('button', { name: `Ajustar ${nome}` }));
    return screen.getByRole('dialog', { name: `Ajustar estoque de ${nome}` });
  }

  it('entrada: manda motivo e quantidade, mostra a prévia e põe o saldo devolvido na linha', async () => {
    const chamadas = servidor();
    renderizar();
    const modal = await abrirAjuste('Esfera 2');

    expect(modal).toHaveTextContent('Disponível agora: 3');
    await userEvent.type(within(modal).getByLabelText('Quantidade'), '5');
    expect(within(modal).getByText(/Disponível: 3 →/)).toHaveTextContent('3 → 8');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar ajuste' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST')!;
    expect(post.corpo).toEqual({ tipo: 'ENTRADA', quantidade: 5 });
    expect(post.url).toMatch(/\/estoque\/admin\/estoque\/00000002-.*\/ajustes$/);

    const tabela = screen.getByRole('table', { name: 'Estoque por produto' });
    const linhaDaEsfera2 = linhas(tabela).find((l) => l.textContent?.includes('Esfera 2'))!;
    expect(within(linhaDaEsfera2).getAllByRole('cell')[1]).toHaveTextContent('8');
  });

  it('perda e correção usam o motivo escolhido; correção aceita zero', async () => {
    const chamadas = servidor({ ajuste: (corpo) => json({ ...item(2, corpo.tipo === 'CORRECAO' ? corpo.quantidade : 1) }) });
    renderizar();

    let modal = await abrirAjuste('Esfera 2');
    await userEvent.selectOptions(within(modal).getByLabelText('Motivo'), 'PERDA');
    await userEvent.type(within(modal).getByLabelText('Quantidade'), '2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar ajuste' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    modal = await abrirAjuste('Esfera 2');
    await userEvent.selectOptions(within(modal).getByLabelText('Motivo'), 'CORRECAO');
    await userEvent.type(within(modal).getByLabelText('Saldo correto'), '0');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar ajuste' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(chamadas.filter((c) => c.metodo === 'POST').map((c) => c.corpo)).toEqual([
      { tipo: 'PERDA', quantidade: 2 },
      { tipo: 'CORRECAO', quantidade: 0 },
    ]);
  });

  it('confere antes de enviar: vazio, decimal, zero e perda maior que o disponível não chamam o servidor', async () => {
    const chamadas = servidor();
    renderizar();
    const modal = await abrirAjuste('Esfera 2');
    const salvar = within(modal).getByRole('button', { name: 'Salvar ajuste' });
    const campo = within(modal).getByLabelText('Quantidade');

    await userEvent.click(salvar);
    expect(campo).toHaveAccessibleDescription('Informe a quantidade.');
    await userEvent.type(campo, '1.5');
    await userEvent.click(salvar);
    expect(campo).toHaveAccessibleDescription('Use um número inteiro.');
    await userEvent.clear(campo);
    await userEvent.type(campo, '0');
    await userEvent.click(salvar);
    expect(campo).toHaveAccessibleDescription('A quantidade deve ser de 1 em diante.');

    await userEvent.selectOptions(within(modal).getByLabelText('Motivo'), 'PERDA');
    await userEvent.clear(campo);
    await userEvent.type(campo, '4');
    await userEvent.click(salvar);
    expect(campo).toHaveAccessibleDescription('A perda não pode passar do disponível (3).');

    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('recusa do servidor (422) mostra o motivo no campo e mantém o modal aberto', async () => {
    servidor({ ajuste: () => json({ detail: 'a perda de 2 é maior que o disponível (1)' }, 422) });
    renderizar();
    const modal = await abrirAjuste('Esfera 2');
    await userEvent.selectOptions(within(modal).getByLabelText('Motivo'), 'PERDA');
    await userEvent.type(within(modal).getByLabelText('Quantidade'), '2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar ajuste' }));

    await waitFor(() => expect(within(modal).getByLabelText('Quantidade')).toHaveAccessibleDescription(/maior que o disponível/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Salvar ajuste' })).toBeEnabled();
  });

  it('produto sem estoque cadastrado recebe a primeira entrada', async () => {
    const chamadas = servidor({ ajuste: () => json({ ...item(4, 10) }) });
    renderizar();
    const modal = await abrirAjuste('Esfera 4');

    await userEvent.type(within(modal).getByLabelText('Quantidade'), '10');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar ajuste' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'POST')!.corpo).toEqual({ tipo: 'ENTRADA', quantidade: 10 });
    const linha = linhas(screen.getByRole('table', { name: 'Estoque por produto' })).find((l) => l.textContent?.includes('Esfera 4'))!;
    expect(linha).not.toHaveTextContent('Sem estoque cadastrado');
    expect(linha).toHaveTextContent('Ok');
  });

  it('Cancelar fecha o modal sem chamar o servidor', async () => {
    const chamadas = servidor();
    renderizar();
    const modal = await abrirAjuste('Esfera 2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });
});

describe('regras puras do estoque', () => {
  it('montarLinhas mantém saldo de produto que não veio na lista e ordena pelo menor saldo', () => {
    const resultado = montarLinhas([produto(1)], [item(1, 9), { produtoId: '99999999-aaaa-bbbb-cccc-dddddddddddd', disponivel: 2, reservado: 1, emEstoque: true, estoqueBaixo: true }]);
    expect(resultado.map((l) => l.disponivel)).toEqual([2, 9]);
    expect(resultado[0]).toMatchObject({ sku: '—', nome: 'Produto 99999999', cadastrado: true });
  });

  it('filtrarLinhas combina busca e saldo baixo', () => {
    const todas = montarLinhas([produto(1), produto(2)], [item(1, 1), item(2, 50)]);
    expect(filtrarLinhas(todas, '', true).map((l) => l.nome)).toEqual(['Esfera 1']);
    expect(filtrarLinhas(todas, 'esfera 2', false).map((l) => l.nome)).toEqual(['Esfera 2']);
    expect(filtrarLinhas(todas, 'esfera 2', true)).toEqual([]);
  });

  it('aplicarItem troca o saldo e marca como cadastrado', () => {
    const [sem] = montarLinhas([produto(4)], []);
    expect(sem.cadastrado).toBe(false);
    expect(aplicarItem([sem], item(4, 7))[0]).toMatchObject({ cadastrado: true, disponivel: 7, baixo: false });
  });

  it('saldoDepois e validarAjuste', () => {
    expect(saldoDepois(3, 'ENTRADA', 5)).toBe(8);
    expect(saldoDepois(3, 'PERDA', 2)).toBe(1);
    expect(saldoDepois(3, 'CORRECAO', 0)).toBe(0);
    expect(validarAjuste('ENTRADA', '5', 3)).toBeNull();
    expect(validarAjuste('CORRECAO', '0', 3)).toBeNull();
    expect(validarAjuste('CORRECAO', '-1', 3)).toMatch(/negativo/);
    expect(validarAjuste('PERDA', '3', 3)).toBeNull();
    expect(validarAjuste('PERDA', '4', 3)).toMatch(/disponível \(3\)/);
  });
});
