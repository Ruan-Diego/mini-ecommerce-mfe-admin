/**
 * Pedidos de qualquer cliente, no pedido-service (`/admin/**`: papel admin). A resposta do admin traz
 * `transicoesPermitidas`: a tela só oferece essas transições, sem repetir a máquina de estados do backend.
 */
import { chamar, comQuery, type ObterToken } from './http';

export type StatusPedido = 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'EM_SEPARACAO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO';

export interface ItemPedido {
  produtoId: string;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  subtotal: number;
}

export interface PedidoAdmin {
  id: string;
  clienteId: string;
  status: StatusPedido;
  /** Próximos status que o admin pode aplicar agora (PAGO nunca: quem paga é o pagamento-service). */
  transicoesPermitidas: StatusPedido[];
  itens: ItemPedido[];
  endereco: {
    destinatario: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: string;
  };
  frete: { codigo: string; nome: string; valor: number; prazoDias: number };
  subtotal: number;
  total: number;
  codigoRastreio: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
  totalPaginas: number;
}

export interface IndicadoresPedidos {
  /** O "hoje" da loja (fuso da loja), aaaa-mm-dd. */
  dia: string;
  pedidosHoje: number;
  faturamentoDoDia: number;
  aguardandoPagamento: number;
}

export interface FiltroPedidos {
  status?: readonly StatusPedido[];
  /** aaaa-mm-dd, inclusivo. */
  de?: string;
  ate?: string;
  /** Começa em 0. */
  pagina?: number;
  tamanho?: number;
}

export const indicadoresDePedidos = (obterToken: ObterToken, sinal?: AbortSignal) =>
  chamar<IndicadoresPedidos>('GET', '/pedidos/admin/indicadores', obterToken, { sinal });

/** Mais recentes primeiro. */
export const listarPedidos = (obterToken: ObterToken, filtro: FiltroPedidos = {}, sinal?: AbortSignal) =>
  chamar<Pagina<PedidoAdmin>>(
    'GET',
    comQuery('/pedidos/admin/pedidos', {
      status: filtro.status,
      de: filtro.de,
      ate: filtro.ate,
      pagina: filtro.pagina,
      tamanho: filtro.tamanho,
    }),
    obterToken,
    { sinal },
  );

export const obterPedidoAdmin = (obterToken: ObterToken, id: string, sinal?: AbortSignal) =>
  chamar<PedidoAdmin>('GET', `/pedidos/admin/pedidos/${encodeURIComponent(id)}`, obterToken, { sinal });

/**
 * Aplica uma transição. ENVIADO exige `codigoRastreio` (até 40 caracteres); transição que o status atual não
 * permite responde 422 com o motivo em `detail`.
 */
export const alterarStatus = (obterToken: ObterToken, id: string, status: StatusPedido, codigoRastreio?: string) =>
  chamar<PedidoAdmin>('PATCH', `/pedidos/admin/pedidos/${encodeURIComponent(id)}/status`, obterToken, {
    corpo: { status, codigoRastreio: codigoRastreio ?? null },
  });
