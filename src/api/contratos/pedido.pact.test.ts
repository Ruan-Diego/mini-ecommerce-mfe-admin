// @vitest-environment node
/**
 * Contrato (Pact) do mfe-admin com o pedido-service: uma interação para cada chamada HTTP do admin sobre pedidos
 * (indicadores, lista com filtros, detalhe, mudança de status), com os casos que as telas tratam (404, rastreio
 * obrigatório, transição inválida, sem papel admin). Grava pacts/mfe-admin-pedido-service.json.
 *
 * O MFE chama pelo caminho do gateway (/pedidos/admin/...): o teste do provider tira o prefixo /pedidos.
 */
import { MatchersV3 } from '@pact-foundation/pact';
import { alterarStatus, indicadoresDePedidos, listarPedidos, obterPedidoAdmin } from '../pedidos';
import type { ErroDeApi } from '../http';
import { CABECALHOS_ADMIN, CABECALHOS_ADMIN_JSON, CABECALHOS_CLIENTE, JSON_UTF8, instante, novoProvider, obterTokenAdmin, obterTokenCliente } from './comum';

const { eachLike, like, number, integer, string, uuid, regex } = MatchersV3;

const provider = novoProvider('pedido-service');

const PEDIDO = '22222222-2222-4222-8222-222222222222';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';
const PRODUTO = '11111111-1111-4111-8111-111111111111';
const STATUS = /AGUARDANDO_PAGAMENTO|PAGO|EM_SEPARACAO|ENVIADO|ENTREGUE|CANCELADO/.source;
const PROBLEMA = regex(/application\/(problem\+)?json.*/.source, 'application/problem+json');

/** O pedido como o admin vê: o do cliente mais o dono e as transições que a tela pode oferecer. */
const pedido = (status: string, transicoes: string[], codigoRastreio: string | null = null) => ({
  id: uuid(PEDIDO),
  clienteId: string('cliente-pact'),
  status: regex(STATUS, status),
  transicoesPermitidas: eachLike(regex(STATUS, transicoes[0])),
  itens: eachLike({
    produtoId: uuid(PRODUTO),
    nome: string('Esfera Chrome'),
    precoUnitario: number(100.0),
    quantidade: integer(2),
    subtotal: number(200.0),
  }),
  endereco: like({
    destinatario: string('Ana Souza'),
    cep: string('01310100'),
    logradouro: string('Av. Paulista'),
    numero: string('1000'),
    bairro: string('Bela Vista'),
    cidade: string('São Paulo'),
    uf: string('SP'),
  }),
  frete: like({ codigo: string('padrao'), nome: string('Padrão'), valor: number(19.9), prazoDias: integer(7) }),
  subtotal: number(200.0),
  total: number(219.9),
  codigoRastreio: codigoRastreio === null ? null : string(codigoRastreio),
  criadoEm: instante('2026-11-20T12:00:00Z'),
  atualizadoEm: instante('2026-11-20T12:00:00Z'),
});

const pagina = (corpo: unknown, tamanho: number) => ({
  itens: eachLike(corpo),
  pagina: integer(0),
  tamanho: integer(tamanho),
  total: integer(1),
  totalPaginas: integer(1),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contrato mfe-admin → pedido-service', () => {
  it('lê os indicadores de pedidos do painel', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 pago de um cliente')
      .uponReceiving('os indicadores de pedidos do admin')
      .withRequest({ method: 'GET', path: '/pedidos/admin/indicadores', headers: CABECALHOS_ADMIN })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': JSON_UTF8 },
        body: {
          dia: regex(/\d{4}-\d{2}-\d{2}/.source, '2026-11-20'),
          pedidosHoje: integer(0),
          faturamentoDoDia: number(0),
          aguardandoPagamento: integer(0),
        },
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const indicadores = await indicadoresDePedidos(obterTokenAdmin);
      expect(typeof indicadores.pedidosHoje).toBe('number');
      expect(indicadores.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('lista os 10 últimos pedidos do painel', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 pago de um cliente')
      .uponReceiving('a página dos 10 últimos pedidos')
      .withRequest({ method: 'GET', path: '/pedidos/admin/pedidos', query: { pagina: '0', tamanho: '10' }, headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: pagina(pedido('PAGO', ['EM_SEPARACAO']), 10) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const resultado = await listarPedidos(obterTokenAdmin, { pagina: 0, tamanho: 10 });
      expect(resultado.itens[0].id).toBe(PEDIDO);
      expect(resultado.itens[0].clienteId).toBe('cliente-pact');
    });
  });

  it('filtra os pedidos por status (repetido) e período', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 pago de um cliente')
      .uponReceiving('a lista de pedidos filtrada por status e período')
      .withRequest({
        method: 'GET',
        path: '/pedidos/admin/pedidos',
        query: { status: ['PAGO', 'ENVIADO'], de: '2026-11-01', ate: '2026-11-30', pagina: '0', tamanho: '20' },
        headers: CABECALHOS_ADMIN,
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: pagina(pedido('PAGO', ['EM_SEPARACAO']), 20) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const resultado = await listarPedidos(obterTokenAdmin, {
        status: ['PAGO', 'ENVIADO'],
        de: '2026-11-01',
        ate: '2026-11-30',
        pagina: 0,
        tamanho: 20,
      });
      expect(resultado.total).toBe(1);
      expect(resultado.itens[0].status).toBe('PAGO');
    });
  });

  it('lê o detalhe de um pedido, com as transições permitidas', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 pago de um cliente')
      .uponReceiving('o detalhe de um pedido para o admin')
      .withRequest({ method: 'GET', path: `/pedidos/admin/pedidos/${PEDIDO}`, headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: pedido('PAGO', ['EM_SEPARACAO']) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const lido = await obterPedidoAdmin(obterTokenAdmin, PEDIDO);
      expect(lido.transicoesPermitidas.length).toBeGreaterThan(0);
      expect(lido.endereco.cidade).toBe('São Paulo');
    });
  });

  it('pedido que não existe é 404', async () => {
    provider
      .given('não existe o pedido 55555555-5555-4555-8555-555555555555')
      .uponReceiving('o detalhe de um pedido que não existe')
      .withRequest({ method: 'GET', path: `/pedidos/admin/pedidos/${INEXISTENTE}`, headers: CABECALHOS_ADMIN })
      .willRespondWith({ status: 404 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(obterPedidoAdmin(obterTokenAdmin, INEXISTENTE)).rejects.toMatchObject({ status: 404 } satisfies Partial<ErroDeApi>);
    });
  });

  it('move um pedido pago para em separação', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 pago de um cliente')
      .uponReceiving('a mudança de um pedido pago para em separação')
      .withRequest({
        method: 'PATCH',
        path: `/pedidos/admin/pedidos/${PEDIDO}/status`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { status: 'EM_SEPARACAO', codigoRastreio: null },
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: pedido('EM_SEPARACAO', ['ENVIADO']) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const alterado = await alterarStatus(obterTokenAdmin, PEDIDO, 'EM_SEPARACAO');
      expect(alterado.status).toBe('EM_SEPARACAO');
    });
  });

  it('envia o pedido com o código de rastreio', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 em separação')
      .uponReceiving('o envio de um pedido com código de rastreio')
      .withRequest({
        method: 'PATCH',
        path: `/pedidos/admin/pedidos/${PEDIDO}/status`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { status: 'ENVIADO', codigoRastreio: 'BR123456789' },
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': JSON_UTF8 }, body: pedido('ENVIADO', ['ENTREGUE'], 'BR123456789') });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const enviado = await alterarStatus(obterTokenAdmin, PEDIDO, 'ENVIADO', 'BR123456789');
      expect(enviado.codigoRastreio).toBe('BR123456789');
    });
  });

  it('enviar sem código de rastreio é recusado (422) com o motivo', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 em separação')
      .uponReceiving('o envio de um pedido sem código de rastreio')
      .withRequest({
        method: 'PATCH',
        path: `/pedidos/admin/pedidos/${PEDIDO}/status`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { status: 'ENVIADO', codigoRastreio: null },
      })
      .willRespondWith({ status: 422, headers: { 'Content-Type': PROBLEMA }, body: like({ detail: string('informe o código de rastreio') }) });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(alterarStatus(obterTokenAdmin, PEDIDO, 'ENVIADO')).rejects.toMatchObject({ status: 422 } satisfies Partial<ErroDeApi>);
    });
  });

  it('transição que o status atual não permite é recusada (422) com o motivo', async () => {
    provider
      .given('existe o pedido 22222222-2222-4222-8222-222222222222 enviado')
      .uponReceiving('o cancelamento de um pedido já enviado pelo admin')
      .withRequest({
        method: 'PATCH',
        path: `/pedidos/admin/pedidos/${PEDIDO}/status`,
        headers: CABECALHOS_ADMIN_JSON,
        body: { status: 'CANCELADO', codigoRastreio: null },
      })
      .willRespondWith({
        status: 422,
        headers: { 'Content-Type': PROBLEMA },
        body: like({ detail: string('transição de ENVIADO para CANCELADO não é permitida') }),
      });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      const erro = await alterarStatus(obterTokenAdmin, PEDIDO, 'CANCELADO').catch((e: ErroDeApi) => e);
      expect(erro).toMatchObject({ status: 422 });
      expect((erro as ErroDeApi).message).toMatch(/não é permitida/);
    });
  });

  it('quem não é admin recebe 403 nas rotas /admin', async () => {
    provider
      .uponReceiving('os indicadores de pedidos pedidos por quem não é admin')
      .withRequest({ method: 'GET', path: '/pedidos/admin/indicadores', headers: CABECALHOS_CLIENTE })
      .willRespondWith({ status: 403 });

    await provider.executeTest(async (mock) => {
      vi.stubEnv('VITE_API_URL', mock.url);
      await expect(indicadoresDePedidos(obterTokenCliente)).rejects.toMatchObject({ status: 403 } satisfies Partial<ErroDeApi>);
    });
  });
});
