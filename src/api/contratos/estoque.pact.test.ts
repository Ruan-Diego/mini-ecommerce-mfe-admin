// @vitest-environment node
/**
 * Contrato (Pact) do mfe-admin com o estoque-service: indicador de estoque baixo, lista (com e sem o filtro
 * `abaixoDe`) e ajuste do saldo, com os casos que a tela de Estoque trata (saldo inválido, sem papel admin).
 * Grava pacts/mfe-admin-estoque-service.json. O MFE chama pelo gateway (/estoque/admin/...): o teste do provider
 * tira o prefixo /estoque.
 */
import { MatchersV3 } from '@pact-foundation/pact';
import { ajustarEstoque, definirDisponivel, indicadoresDeEstoque, listarEstoque } from '../estoque';
import type { ErroDeApi } from '../http';
import { CABECALHOS_ADMIN, CABECALHOS_ADMIN_JSON, CABECALHOS_CLIENTE, JSON_UTF8, novoProvider, obterTokenAdmin, obterTokenCliente } from './comum';

const { eachLike, integer, boolean, uuid, like, string, regex } = MatchersV3;
const PROBLEMA = regex(/application\/(problem\+)?json.*/.source, 'application/problem+json');

const provider = novoProvider('estoque-service');

const PRODUTO = '11111111-1111-4111-8111-111111111111';
const ESTADO = 'o produto 11111111-1111-4111-8111-111111111111 tem 3 unidades disponíveis no estoque';

const item = (disponivel: number, baixo: boolean) => ({
  produtoId: uuid(PRODUTO),
  disponivel: integer(disponivel),
  reservado: integer(0),
  emEstoque: boolean(disponivel > 0),
  estoqueBaixo: boolean(baixo),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contrato mfe-admin → estoque-service', () => {
  it('lê o indicador de estoque baixo do painel', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('os indicadores de estoque do admin')
      .withRequest({ method: 'GET', path: '/estoque/admin/indicadores', headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: { estoqueBaixo: integer(1), limite: integer(5) } });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const indicadores = await indicadoresDeEstoque(obterTokenAdmin);
      expect(indicadores.estoqueBaixo).toBe(1);
      expect(indicadores.limite).toBe(5);
    });
  });

  it('lista o estoque abaixo de 5 (filtro da tela)', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('a lista do estoque abaixo de 5')
      .withRequest({ method: 'GET', path: '/estoque/admin/estoque', query: { abaixoDe: '5' }, headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: eachLike(item(3, true)) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const lista = await listarEstoque(obterTokenAdmin, 5);
      expect(lista[0]).toMatchObject({ produtoId: PRODUTO, disponivel: 3, estoqueBaixo: true });
    });
  });

  it('lista todo o estoque, do menor saldo para o maior', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('a lista de todo o estoque')
      .withRequest({ method: 'GET', path: '/estoque/admin/estoque', headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: eachLike(item(3, true)) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const lista = await listarEstoque(obterTokenAdmin);
      expect(lista).toHaveLength(1);
    });
  });

  it('define o saldo disponível e recebe o item atualizado', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('o ajuste do saldo disponível para 20')
      .withRequest({ method: 'PUT', path: `/estoque/admin/estoque/${PRODUTO}`, headers: CABECALHOS_ADMIN_JSON, body: { disponivel: 20 } })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        body: { produtoId: uuid(PRODUTO), disponivel: 20, reservado: integer(0), emEstoque: true, estoqueBaixo: false },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const atualizado = await definirDisponivel(obterTokenAdmin, PRODUTO, 20);
      expect(atualizado).toMatchObject({ disponivel: 20, estoqueBaixo: false });
    });
  });

  it('registra uma entrada (soma ao saldo de agora) e recebe o item atualizado', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('o ajuste de entrada de 5 unidades')
      .withRequest({
        method: 'POST',
        path: `/estoque/admin/estoque/${PRODUTO}/ajustes`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { tipo: 'ENTRADA', quantidade: 5 },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        body: { produtoId: uuid(PRODUTO), disponivel: 8, reservado: integer(0), emEstoque: true, estoqueBaixo: false },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const atualizado = await ajustarEstoque(obterTokenAdmin, PRODUTO, 'ENTRADA', 5);
      expect(atualizado).toMatchObject({ disponivel: 8, estoqueBaixo: false });
    });
  });

  it('perda maior que o disponível é recusada (422) com o motivo', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('o ajuste de perda maior que o disponível')
      .withRequest({
        method: 'POST',
        path: `/estoque/admin/estoque/${PRODUTO}/ajustes`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { tipo: 'PERDA', quantidade: 10 },
      })
      .willRespondWith({ status: 422, headers: { 'Content-Type': PROBLEMA }, body: like({ detail: string('a perda de 10 é maior que o disponível (3)') }) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const erro = await ajustarEstoque(obterTokenAdmin, PRODUTO, 'PERDA', 10).catch((e: ErroDeApi) => e);
      expect(erro).toMatchObject({ status: 422 });
      expect((erro as ErroDeApi).message).toMatch(/disponível/);
    });
  });

  it('saldo negativo é recusado (400)', async () => {
    provider
      .given(ESTADO)
      .uponReceiving('o ajuste do saldo para um valor negativo')
      .withRequest({ method: 'PUT', path: `/estoque/admin/estoque/${PRODUTO}`, headers: CABECALHOS_ADMIN_JSON, body: { disponivel: -1 } })
      .willRespondWith({ status: 400 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(definirDisponivel(obterTokenAdmin, PRODUTO, -1)).rejects.toMatchObject({ status: 400 } satisfies Partial<ErroDeApi>);
    });
  });

  it('quem não é admin recebe 403 nas rotas /admin', async () => {
    provider
      .uponReceiving('a lista do estoque pedida por quem não é admin')
      .withRequest({ method: 'GET', path: '/estoque/admin/estoque', headers: CABECALHOS_CLIENTE })
      .willRespondWith({ status: 403 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(listarEstoque(obterTokenCliente)).rejects.toMatchObject({ status: 403 } satisfies Partial<ErroDeApi>);
    });
  });
});
