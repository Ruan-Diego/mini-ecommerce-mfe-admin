/** Estoque, no estoque-service (`/admin/**`: papel admin). */
import { chamar, comQuery, type ObterToken } from './http';

export interface ItemEstoque {
  produtoId: string;
  disponivel: number;
  reservado: number;
  emEstoque: boolean;
  /** Regra do backend (`ItemEstoque.estoqueBaixo()`): a tela não recalcula o limite. */
  estoqueBaixo: boolean;
}

export interface IndicadoresEstoque {
  /** Quantos produtos estão abaixo do limite. */
  estoqueBaixo: number;
  limite: number;
}

export const indicadoresDeEstoque = (obterToken: ObterToken, sinal?: AbortSignal) =>
  chamar<IndicadoresEstoque>('GET', '/estoque/admin/indicadores', obterToken, { sinal });

/** Menor saldo primeiro, sem paginação. `abaixoDe` filtra (ex.: 5); sem ele lista tudo. */
export const listarEstoque = (obterToken: ObterToken, abaixoDe?: number, sinal?: AbortSignal) =>
  chamar<ItemEstoque[]>('GET', comQuery('/estoque/admin/estoque', { abaixoDe }), obterToken, { sinal });

/** Define o saldo disponível (valor absoluto, não somado). Responde com o item atualizado. */
export const definirDisponivel = (obterToken: ObterToken, produtoId: string, disponivel: number) =>
  chamar<ItemEstoque>('PUT', `/estoque/admin/estoque/${encodeURIComponent(produtoId)}`, obterToken, { corpo: { disponivel } });
