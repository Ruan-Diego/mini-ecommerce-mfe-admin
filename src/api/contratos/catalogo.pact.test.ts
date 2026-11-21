// @vitest-environment node
/**
 * Contrato (Pact) do mfe-admin com o catalogo-service: busca na vitrine, cadastro (com SKU repetido = 409),
 * atualização, desativação e sem papel admin. Grava pacts/mfe-admin-catalogo-service.json. O MFE chama pelo
 * gateway (/catalogo/...): o teste do provider tira o prefixo /catalogo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MatchersV3 } from '@pact-foundation/pact';
import { atualizarProduto, cadastrarProduto, desativarProduto, enviarImagem, listarCategorias, listarProdutos, listarTodosOsProdutos, type DadosDoProduto } from '../catalogo';
import type { ErroDeApi } from '../http';
import { CABECALHOS_ADMIN, CABECALHOS_ADMIN_JSON, CABECALHOS_CLIENTE, JSON_UTF8, novoProvider, obterTokenAdmin, obterTokenCliente } from './comum';

const { eachLike, like, number, integer, string, uuid, boolean, regex } = MatchersV3;

const provider = novoProvider('catalogo-service');

const PRODUTO = '11111111-1111-4111-8111-111111111111';
const CATEGORIA = '33333333-3333-4333-8333-333333333333';
const ESTADO_PRODUTO = 'existe o produto ativo esfera-chrome com o id 11111111-1111-4111-8111-111111111111';
const ESTADO_PRODUTOS_ATIVO_E_DESATIVADO =
  'existem o produto ativo esfera-chrome (11111111-1111-4111-8111-111111111111) e o desativado esfera-lime';
const ESTADO_CATEGORIA = 'existe a categoria esferas com o id 33333333-3333-4333-8333-333333333333';
const PROBLEMA = regex(/application\/(problem\+)?json.*/.source, 'application/problem+json');

const produto = {
  id: uuid(PRODUTO),
  sku: string('ESF-CHROME-01'),
  nome: string('Esfera Chrome'),
  slug: string('esfera-chrome'),
  descricao: string('Esfera de aço polido.'),
  preco: number(289.0),
  imagens: eachLike({ url: string('https://cdn.mini.dev/esfera.webp'), textoAlternativo: string('Esfera cromada') }),
  categoriaId: uuid(CATEGORIA),
  ativo: boolean(true),
};

/** O segundo produto da lista do admin: desativado, o que a vitrine não mostra. */
const produtoDesativado = {
  ...produto,
  id: uuid('66666666-6666-4666-8666-666666666666'),
  sku: string('ESF-LIME-01'),
  nome: string('Esfera Lime'),
  slug: string('esfera-lime'),
  ativo: false,
};

const novo: DadosDoProduto = {
  sku: 'ESF-AZUL-01',
  nome: 'Esfera Azul',
  descricao: 'Esfera de vidro azul.',
  preco: 199.9,
  imagens: [{ url: 'https://cdn.mini.dev/azul.webp', textoAlternativo: 'Esfera azul' }],
  categoriaId: CATEGORIA,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contrato mfe-admin → catalogo-service', () => {
  it('lista os produtos do admin, inclusive desativados, buscando por nome ou SKU', async () => {
    provider
      .given(ESTADO_PRODUTOS_ATIVO_E_DESATIVADO)
      .uponReceiving('a lista de produtos do admin buscando por esf')
      .withRequest({
        method: 'GET',
        path: '/catalogo/admin/produtos',
        query: { busca: 'esf', pagina: '0', tamanho: '20' },
        headers: CABECALHOS_ADMIN,
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        // Dois itens escritos à mão: o desativado (ativo: false, valor exato) tem de aparecer na lista do admin.
        body: { itens: [{ ...produto, ativo: true }, produtoDesativado], pagina: integer(0), tamanho: integer(20), total: integer(2), totalPaginas: integer(1) },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const pagina = await listarProdutos(obterTokenAdmin, 'esf', 0, 20);
      expect(pagina.total).toBe(2);
      expect(pagina.itens.map((p) => p.ativo)).toEqual([true, false]);
      expect(pagina.itens[0]).toMatchObject({ id: PRODUTO, sku: 'ESF-CHROME-01' });
    });
  });

  it('lista todos os produtos em páginas de 100 (tela de Estoque)', async () => {
    provider
      .given(ESTADO_PRODUTOS_ATIVO_E_DESATIVADO)
      .uponReceiving('a lista de produtos do admin em páginas de 100')
      .withRequest({ method: 'GET', path: '/catalogo/admin/produtos', query: { pagina: '0', tamanho: '100' }, headers: CABECALHOS_ADMIN })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        body: { itens: [{ ...produto, ativo: true }, produtoDesativado], pagina: integer(0), tamanho: integer(100), total: integer(2), totalPaginas: integer(1) },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const todos = await listarTodosOsProdutos(obterTokenAdmin);
      expect(todos.map((p) => p.sku)).toEqual(['ESF-CHROME-01', 'ESF-LIME-01']);
    });
  });

  it('lista as categorias para o seletor do formulário', async () => {
    provider
      .given(ESTADO_CATEGORIA)
      .uponReceiving('a lista de categorias')
      .withRequest({ method: 'GET', path: '/catalogo/categorias', headers: CABECALHOS_ADMIN })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        body: eachLike({ id: uuid(CATEGORIA), nome: string('Esferas'), slug: string('esferas'), paiId: null }),
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const categorias = await listarCategorias(obterTokenAdmin);
      expect(categorias[0]).toMatchObject({ id: CATEGORIA, nome: 'Esferas', paiId: null });
    });
  });

  it('cadastra um produto e recebe o id', async () => {
    provider
      .given(ESTADO_CATEGORIA)
      .uponReceiving('o cadastro de um produto')
      .withRequest({ method: 'POST', path: '/catalogo/admin/produtos', headers: CABECALHOS_ADMIN_JSON, body: novo })
      .willRespondWith({ status: 201, headers: { 'Content-Type': JSON_UTF8 }, body: { id: uuid('44444444-4444-4444-8444-444444444444') } });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const criado = await cadastrarProduto(obterTokenAdmin, novo);
      expect(criado.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('SKU repetido é recusado (409) com o motivo', async () => {
    provider
      .given(ESTADO_PRODUTO)
      .uponReceiving('o cadastro de um produto com SKU que já existe')
      .withRequest({ method: 'POST', path: '/catalogo/admin/produtos', headers: CABECALHOS_ADMIN_JSON, body: { ...novo, sku: 'ESF-CHROME-01' } })
      .willRespondWith({ status: 409, headers: { 'Content-Type': PROBLEMA }, body: like({ detail: string('já existe produto com o SKU ESF-CHROME-01'), campo: string('sku') }) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const erro = await cadastrarProduto(obterTokenAdmin, { ...novo, sku: 'ESF-CHROME-01' }).catch((e: ErroDeApi) => e);
      expect(erro).toMatchObject({ status: 409, campo: 'sku' });
      expect((erro as ErroDeApi).message).toMatch(/SKU/);
    });
  });

  it('atualiza dados e preço de um produto', async () => {
    const dados: DadosDoProduto = { ...novo, sku: undefined, nome: 'Esfera Chrome', preco: 259.0, categoriaId: CATEGORIA };
    provider
      .given(ESTADO_PRODUTO)
      .uponReceiving('a atualização de um produto')
      .withRequest({ method: 'PUT', path: `/catalogo/admin/produtos/${PRODUTO}`, headers: CABECALHOS_ADMIN_JSON, body: dados })
      .willRespondWith({ status: 204 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(atualizarProduto(obterTokenAdmin, PRODUTO, dados)).resolves.toBeUndefined();
    });
  });

  it('desativa um produto (não apaga)', async () => {
    provider
      .given(ESTADO_PRODUTO)
      .uponReceiving('a desativação de um produto')
      .withRequest({ method: 'DELETE', path: `/catalogo/admin/produtos/${PRODUTO}`, headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 204 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(desativarProduto(obterTokenAdmin, PRODUTO)).resolves.toBeUndefined();
    });
  });

  it('envia uma imagem do produto (multipart) e recebe a imagem com a URL pública', async () => {
    const arquivo = path.resolve(import.meta.dirname, 'fixtures/pixel.png');
    provider
      .given(ESTADO_PRODUTO)
      .uponReceiving('o envio de uma imagem do produto')
      // O Pact grava só a parte do arquivo no multipart: o texto alternativo vai na query (o @RequestParam do
      // Spring lê dos dois lugares), e assim o contrato fiscaliza o arquivo e o texto.
      .withRequestMultipartFileUpload(
        {
          method: 'POST',
          path: `/catalogo/admin/produtos/${PRODUTO}/imagens`,
          query: { textoAlternativo: 'Foto da esfera' },
          headers: CABECALHOS_ADMIN,
        },
        'image/png',
        arquivo,
        'arquivo',
      )
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': JSON_UTF8 },
        body: { url: regex(/^https?:\/\/.+/.source, 'http://localhost:8080/api/catalogo/imagens/abc.png'), textoAlternativo: string('Foto da esfera') },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const conteudo = new Blob([readFileSync(arquivo)], { type: 'image/png' });
      const imagem = await enviarImagem(obterTokenAdmin, PRODUTO, conteudo, 'pixel.png', 'Foto da esfera');
      expect(imagem.url).toMatch(/^https?:\/\//);
    });
  });

  it('quem não é admin recebe 403 ao cadastrar', async () => {
    provider
      .uponReceiving('o cadastro de um produto por quem não é admin')
      .withRequest({ method: 'POST', path: '/catalogo/admin/produtos', headers: { ...CABECALHOS_CLIENTE, 'Content-Type': 'application/json' }, body: novo })
      .willRespondWith({ status: 403 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(cadastrarProduto(obterTokenCliente, novo)).rejects.toMatchObject({ status: 403 } satisfies Partial<ErroDeApi>);
    });
  });
});
