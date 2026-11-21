import type { PedidoAdmin, StatusPedido } from './api/pedidos';

export const STATUS_DO_FILTRO: StatusPedido[] = ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO'];

/** O backend limita o código de rastreio a 40 caracteres. */
export const RASTREIO_MAXIMO = 40;

/** Texto do botão de cada transição que o servidor oferece. */
export const ROTULO_DA_ACAO: Record<StatusPedido, string> = {
  AGUARDANDO_PAGAMENTO: 'Voltar para aguardando pagamento',
  PAGO: 'Marcar como pago',
  EM_SEPARACAO: 'Iniciar separação',
  ENVIADO: 'Marcar como enviado',
  ENTREGUE: 'Marcar como entregue',
  CANCELADO: 'Cancelar pedido',
};

/** Confere o período digitado (aaaa-mm-dd, como o `input type=date` entrega); devolve a mensagem ou null. */
export function validarPeriodo(de: string, ate: string): string | null {
  if (de && ate && de > ate) return 'A data inicial não pode ser depois da final.';
  return null;
}

/** ENVIADO exige o código de rastreio (1 a 40 caracteres, sem espaços nas pontas). */
export function validarRastreio(texto: string): string | null {
  const codigo = texto.trim();
  if (!codigo) return 'Informe o código de rastreio.';
  if (codigo.length > RASTREIO_MAXIMO) return `O código deve ter até ${RASTREIO_MAXIMO} caracteres.`;
  return null;
}

/**
 * As ações que o painel oferece: exatamente as `transicoesPermitidas` do servidor, na ordem dele. A tela não repete a
 * máquina de estados do backend, então uma transição inválida nunca vira botão (e, se o fluxo mudar lá, a tela
 * acompanha sem mudar aqui).
 */
export const acoesDoPedido = (pedido: PedidoAdmin): StatusPedido[] => [...pedido.transicoesPermitidas];
