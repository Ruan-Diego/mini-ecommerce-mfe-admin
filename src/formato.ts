import type { StatusPedido } from './api/pedidos';

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  PAGO: 'Pago',
  EM_SEPARACAO: 'Em separação',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export const TOM_STATUS: Record<StatusPedido, 'neutro' | 'destaque' | 'aviso' | 'erro' | 'sucesso'> = {
  AGUARDANDO_PAGAMENTO: 'aviso',
  PAGO: 'destaque',
  EM_SEPARACAO: 'destaque',
  ENVIADO: 'destaque',
  ENTREGUE: 'sucesso',
  CANCELADO: 'erro',
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (valor: number) => moeda.format(valor);

export const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

/** aaaa-mm-dd (o "hoje" da loja) → dd/mm/aaaa, sem passar por fuso (a data já é a do dia da loja). */
export const formatarDia = (dia: string) => dia.split('-').reverse().join('/');

/** Número curto do pedido para mostrar (o id é um UUID). */
export const numeroDoPedido = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
