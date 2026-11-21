import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { criarEventBus } from '@ruan-diego/mini-event-contracts';
import App from '../App';
import type { Categoria, Produto } from '../api/catalogo';
import { ErroDeApi } from '../api/http';
import { campoDoErro, lerPreco, validarArquivo } from '../produtos';

const CATEGORIA: Categoria = { id: '33333333-3333-4333-8333-333333333333', nome: 'Esferas', slug: 'esferas', paiId: null };

function produto(n: number, extra: Partial<Produto> = {}): Produto {
  return {
    id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
    sku: `ESF-0${n}`,
    nome: `Esfera ${n}`,
    slug: `esfera-${n}`,
    descricao: 'Esfera de aço.',
    preco: 100 + n,
    imagens: [],
    categoriaId: CATEGORIA.id,
    ativo: true,
    ...extra,
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const pagina = (itens: Produto[], totalPaginas = 1) => ({ itens, pagina: 0, tamanho: 20, total: itens.length, totalPaginas });

interface Chamada {
  metodo: string;
  url: string;
  corpo?: unknown;
}

interface Cenario {
  lista?: (url: string) => Response;
  post?: (corpo: unknown) => Response;
  put?: (corpo: unknown) => Response;
  imagem?: () => Response;
}

/** Servidor falso do catálogo (categorias, lista, cadastro, edição, desativação, upload). */
function servidor(cenario: Cenario = {}) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      chamadas.push({ metodo, url, corpo });
      if (metodo === 'GET' && url.includes('/catalogo/categorias')) return json([CATEGORIA]);
      if (metodo === 'GET' && url.includes('/catalogo/admin/produtos'))
        return (cenario.lista ?? (() => json(pagina([produto(1), produto(2, { ativo: false })]))))(url);
      if (metodo === 'POST' && url.includes('/imagens'))
        return (cenario.imagem ?? (() => json({ url: 'https://cdn.mini.dev/nova.png', textoAlternativo: 'Foto nova' }, 201)))();
      if (metodo === 'POST') return (cenario.post ?? (() => json({ id: '99999999-aaaa-bbbb-cccc-dddddddddddd' }, 201)))(corpo);
      if (metodo === 'PUT') return (cenario.put ?? (() => new Response(null, { status: 204 })))(corpo);
      if (metodo === 'DELETE') return new Response(null, { status: 204 });
      return json({}, 404);
    }),
  );
  return chamadas;
}

function renderizar() {
  render(
    <MemoryRouter initialEntries={['/produtos']}>
      <App basePath="/" getToken={async () => 'token'} eventBus={criarEventBus(new EventTarget())} />
    </MemoryRouter>,
  );
}

async function abrirCadastro() {
  await screen.findByRole('table', { name: 'Produtos' });
  const botao = screen.getByRole('button', { name: '+ Novo produto' });
  await waitFor(() => expect(botao).toBeEnabled());
  await userEvent.click(botao);
  return screen.getByRole('form', { name: 'Novo produto' });
}

async function preencher(formulario: HTMLElement, sku = 'ESF-NOVA') {
  await userEvent.type(within(formulario).getByLabelText('SKU'), sku);
  await userEvent.type(within(formulario).getByLabelText('Nome'), 'Esfera Nova');
  await userEvent.type(within(formulario).getByLabelText('Preço (R$)'), '1.289,90');
  await userEvent.selectOptions(within(formulario).getByLabelText('Categoria'), CATEGORIA.id);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('Produtos: lista', () => {
  it('mostra os produtos com status; o desativado fica sem o botão Desativar', async () => {
    servidor();
    renderizar();

    const tabela = await screen.findByRole('table', { name: 'Produtos' });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas[0]).toHaveTextContent('ESF-01');
    expect(linhas[0]).toHaveTextContent('Ativo');
    expect(linhas[0]).toHaveTextContent('Esferas');
    expect(within(linhas[0]).getByRole('button', { name: /Desativar/ })).toBeInTheDocument();
    expect(linhas[1]).toHaveTextContent('Desativado');
    expect(within(linhas[1]).queryByRole('button', { name: /Desativar/ })).not.toBeInTheDocument();
  });

  it('busca por nome ou SKU mandando o texto ao servidor e volta para a primeira página', async () => {
    const chamadas = servidor();
    renderizar();
    await screen.findByRole('table', { name: 'Produtos' });

    await userEvent.type(screen.getByLabelText('Buscar por nome ou SKU'), 'esf-01{Enter}');

    await waitFor(() => expect(chamadas.some((c) => c.url.includes('busca=esf-01') && c.url.includes('pagina=0'))).toBe(true));
  });

  it('pagina no servidor: Próxima pede a página 1', async () => {
    const chamadas = servidor({ lista: () => json(pagina([produto(1)], 2)) });
    renderizar();
    await screen.findByRole('table', { name: 'Produtos' });

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(chamadas.some((c) => c.url.includes('pagina=1'))).toBe(true));
  });

  it('sem produtos mostra o estado vazio; busca sem resultado cita o texto', async () => {
    servidor({ lista: () => json(pagina([])) });
    renderizar();
    expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Buscar por nome ou SKU'), 'xyz{Enter}');
    expect(await screen.findByText('Nenhum produto para “xyz”.')).toBeInTheDocument();
  });

  it('403 vira "Acesso negado"; outra falha mostra erro com retry', async () => {
    servidor({ lista: () => json({ detail: 'proibido' }, 403) });
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });

  it('erro de carregamento oferece tentar de novo', async () => {
    servidor({ lista: () => json({ detail: 'falhou' }, 500) });
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os produtos.');
    servidor();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Produtos' })).toBeInTheDocument();
  });
});

describe('Produtos: cadastro', () => {
  it('valida antes de enviar e mostra cada erro no próprio campo, sem chamar o servidor', async () => {
    const chamadas = servidor();
    renderizar();
    const formulario = await abrirCadastro();

    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    expect(within(formulario).getByLabelText('SKU')).toHaveAccessibleDescription('Informe o SKU.');
    expect(within(formulario).getByLabelText('Nome')).toHaveAccessibleDescription('Informe o nome.');
    expect(within(formulario).getByLabelText('Preço (R$)')).toHaveAccessibleDescription('Informe um preço maior que zero.');
    expect(within(formulario).getByLabelText('Categoria')).toHaveAccessibleDescription('Escolha a categoria.');
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('SKU duplicado (409 com campo) mostra o erro no campo SKU e mantém o formulário', async () => {
    servidor({ post: () => json({ detail: 'já existe produto com o SKU ESF-NOVA', campo: 'sku' }, 409) });
    renderizar();
    const formulario = await abrirCadastro();
    await preencher(formulario);

    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    const sku = await within(formulario).findByLabelText('SKU');
    await waitFor(() => expect(sku).toHaveAccessibleDescription('já existe produto com o SKU ESF-NOVA'));
    expect(sku).toBeInvalid();
    expect(within(formulario).getByLabelText('Nome')).toHaveValue('Esfera Nova');
  });

  it('slug duplicado (409) cai no campo Nome, de onde o slug sai', async () => {
    servidor({ post: () => json({ detail: 'já existe produto com o slug esfera-nova', campo: 'slug' }, 409) });
    renderizar();
    const formulario = await abrirCadastro();
    await preencher(formulario);
    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(within(formulario).getByLabelText('Nome')).toHaveAccessibleDescription(/slug esfera-nova/));
  });

  it('erro de regra sem campo (422) aparece acima do formulário', async () => {
    servidor({ post: () => json({ detail: 'algo que o domínio recusou' }, 422) });
    renderizar();
    const formulario = await abrirCadastro();
    await preencher(formulario);
    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    expect(await within(formulario).findByRole('alert')).toHaveTextContent('algo que o domínio recusou');
  });

  it('cadastra com o preço convertido, recarrega a lista e libera o envio de imagens', async () => {
    const chamadas = servidor();
    renderizar();
    const formulario = await abrirCadastro();
    expect(within(formulario).getByText('Salve o produto para poder enviar imagens.')).toBeInTheDocument();
    await preencher(formulario);

    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(within(formulario).getByLabelText('Arquivo (JPEG, PNG ou WebP, até 2 MB)')).toBeInTheDocument());
    const post = chamadas.find((c) => c.metodo === 'POST')!;
    expect(post.corpo).toEqual({ sku: 'ESF-NOVA', nome: 'Esfera Nova', descricao: '', preco: 1289.9, imagens: [], categoriaId: CATEGORIA.id });
    expect(chamadas.filter((c) => c.metodo === 'GET' && c.url.includes('/admin/produtos')).length).toBeGreaterThanOrEqual(2);
    expect(within(formulario).getByLabelText('SKU')).toBeDisabled();
  });
});

describe('Produtos: edição e imagens', () => {
  async function abrirEdicao() {
    const tabela = await screen.findByRole('table', { name: 'Produtos' });
    await userEvent.click(within(tabela).getByRole('button', { name: 'Editar Esfera 1' }));
    return screen.getByRole('form', { name: 'Editar Esfera 1' });
  }

  it('editar envia o PUT sem o SKU (que não muda) e fecha o formulário', async () => {
    const chamadas = servidor();
    renderizar();
    const formulario = await abrirEdicao();
    expect(within(formulario).getByLabelText('SKU')).toBeDisabled();

    const nome = within(formulario).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Esfera Um');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: /Editar/ })).not.toBeInTheDocument());
    const put = chamadas.find((c) => c.metodo === 'PUT')!;
    expect(put.corpo).toMatchObject({ nome: 'Esfera Um', preco: 101, categoriaId: CATEGORIA.id });
    expect(put.corpo).not.toHaveProperty('sku');
    expect(put.url).toMatch(/\/catalogo\/admin\/produtos\/00000001-/);
  });

  it('upload: manda o arquivo com o texto alternativo e o próximo Salvar não perde a imagem enviada', async () => {
    const chamadas = servidor();
    renderizar();
    const formulario = await abrirEdicao();

    const arquivo = new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });
    await userEvent.upload(within(formulario).getByLabelText('Arquivo (JPEG, PNG ou WebP, até 2 MB)'), arquivo);
    await userEvent.type(within(formulario).getByLabelText('Texto alternativo'), 'Foto nova');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Enviar imagem' }));

    expect(await within(formulario).findByText('Imagens (1 de 5)')).toBeInTheDocument();
    const envio = chamadas.find((c) => c.metodo === 'POST' && c.url.includes('/imagens'))!;
    expect(envio.url).toContain('textoAlternativo=Foto+nova');
    expect(envio.corpo).toBeInstanceOf(FormData);

    // O PUT substitui a galeria inteira: se o formulário esquecesse a imagem enviada, o Salvar a apagaria.
    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(true));
    expect((chamadas.find((c) => c.metodo === 'PUT')!.corpo as { imagens: unknown[] }).imagens).toEqual([
      { url: 'https://cdn.mini.dev/nova.png', textoAlternativo: 'Foto nova' },
    ]);
  });

  it('upload exige o texto alternativo e confere tipo e tamanho antes de enviar', async () => {
    const chamadas = servidor();
    renderizar();
    const formulario = await abrirEdicao();
    const escolher = within(formulario).getByLabelText('Arquivo (JPEG, PNG ou WebP, até 2 MB)');

    await userEvent.upload(escolher, new File(['x'], 'foto.png', { type: 'image/png' }));
    await userEvent.click(within(formulario).getByRole('button', { name: 'Enviar imagem' }));
    expect(await within(formulario).findByText('Escreva o texto alternativo da imagem.')).toBeInTheDocument();

    await userEvent.upload(escolher, new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false });
    await userEvent.type(within(formulario).getByLabelText('Texto alternativo'), 'Algo');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Enviar imagem' }));
    expect(await within(formulario).findByText('A imagem deve ser JPEG, PNG ou WebP.')).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.includes('/imagens'))).toBe(false);
  });

  it('com 5 imagens o envio fica desligado', async () => {
    const cinco = Array.from({ length: 5 }, (_, i) => ({ url: `https://cdn.mini.dev/${i}.png`, textoAlternativo: `Foto ${i}` }));
    servidor({ lista: () => json(pagina([produto(1, { imagens: cinco })])) });
    renderizar();
    const formulario = await abrirEdicao();

    expect(within(formulario).getByText('Imagens (5 de 5)')).toBeInTheDocument();
    expect(within(formulario).getByRole('button', { name: 'Enviar imagem' })).toBeDisabled();
  });

  it('remover uma imagem só vale ao salvar (o PUT leva a lista sem ela)', async () => {
    const duas = [
      { url: 'https://cdn.mini.dev/a.png', textoAlternativo: 'A' },
      { url: 'https://cdn.mini.dev/b.png', textoAlternativo: 'B' },
    ];
    const chamadas = servidor({ lista: () => json(pagina([produto(1, { imagens: duas })])) });
    renderizar();
    const formulario = await abrirEdicao();

    await userEvent.click(within(formulario).getByRole('button', { name: /Remover imagem A/ }));
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
    await userEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(true));
    expect((chamadas.find((c) => c.metodo === 'PUT')!.corpo as { imagens: unknown[] }).imagens).toEqual([duas[1]]);
  });
});

describe('Produtos: desativar', () => {
  it('pede confirmação, desativa (DELETE) e recarrega a lista', async () => {
    const chamadas = servidor();
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Produtos' });

    await userEvent.click(within(tabela).getByRole('button', { name: /Desativar Esfera 1/ }));
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Sim, desativar' }));

    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(1));
    expect(chamadas.find((c) => c.metodo === 'DELETE')!.url).toMatch(/\/catalogo\/admin\/produtos\/00000001-/);
  });

  it('"Manter" cancela sem chamar o servidor', async () => {
    const chamadas = servidor();
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Produtos' });

    await userEvent.click(within(tabela).getByRole('button', { name: /Desativar Esfera 1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Manter' }));

    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    expect(within(tabela).getByRole('button', { name: /Desativar Esfera 1/ })).toBeInTheDocument();
  });
});

describe('regras puras do formulário', () => {
  it('lerPreco entende vírgula decimal, milhar com ponto e ponto decimal', () => {
    expect(lerPreco('289,90')).toBe(289.9);
    expect(lerPreco('1.289,90')).toBe(1289.9);
    expect(lerPreco('289.90')).toBe(289.9);
    expect(lerPreco('')).toBeNaN();
    expect(lerPreco('abc')).toBeNaN();
  });

  it('campoDoErro usa o campo do 409 e, sem ele, o assunto da mensagem', () => {
    expect(campoDoErro(new ErroDeApi(409, 'x', 'sku'))).toBe('sku');
    expect(campoDoErro(new ErroDeApi(409, 'x', 'slug'))).toBe('nome');
    expect(campoDoErro(new ErroDeApi(422, 'preço deve ser maior que zero: 0'))).toBe('preco');
    expect(campoDoErro(new ErroDeApi(422, 'SKU deve ter de 3 a 32 caracteres: AB'))).toBe('sku');
    expect(campoDoErro(new ErroDeApi(422, 'imagem precisa de texto alternativo: http://x'))).toBe('imagens');
    expect(campoDoErro(new ErroDeApi(500, 'o servidor respondeu HTTP 500'))).toBeNull();
    expect(campoDoErro(new Error('rede'))).toBeNull();
  });

  it('validarArquivo recusa tipo errado, arquivo grande e galeria cheia', () => {
    expect(validarArquivo({ type: 'image/webp', size: 1000 }, 0)).toBeNull();
    expect(validarArquivo({ type: 'image/gif', size: 1000 }, 0)).toMatch(/JPEG, PNG ou WebP/);
    expect(validarArquivo({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }, 0)).toMatch(/2 MB/);
    expect(validarArquivo({ type: 'image/png', size: 10 }, 5)).toMatch(/5 imagens/);
  });
});
