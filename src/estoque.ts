import type { Produto } from './api/catalogo';
import type { ItemEstoque, TipoDeAjuste } from './api/estoque';

/** Uma linha da tela: o produto do catálogo com o saldo do estoque-service (0 e "sem cadastro" se ele não tem saldo). */
export interface LinhaDeEstoque {
  produtoId: string;
  sku: string;
  nome: string;
  ativo: boolean;
  /** O estoque-service tem saldo registrado para o produto. */
  cadastrado: boolean;
  disponivel: number;
  reservado: number;
  /** Abaixo do limite do estoque-service (a regra é dele); sem saldo cadastrado conta como baixo. */
  baixo: boolean;
}

export const ROTULO_AJUSTE: Record<TipoDeAjuste, string> = {
  ENTRADA: 'Entrada (chegou mercadoria)',
  PERDA: 'Perda (avaria ou extravio)',
  CORRECAO: 'Correção (contagem do estoque)',
};

/**
 * Junta o catálogo com o estoque, do menor saldo para o maior (o que precisa de atenção primeiro). Saldo sem produto
 * na lista (produto fora do que foi carregado) ainda aparece, pelo id, para o admin não perdê-lo de vista.
 */
export function montarLinhas(produtos: Produto[], itens: ItemEstoque[]): LinhaDeEstoque[] {
  const saldos = new Map(itens.map((i) => [i.produtoId, i]));
  const linhas: LinhaDeEstoque[] = produtos.map((p) => {
    const item = saldos.get(p.id);
    return {
      produtoId: p.id,
      sku: p.sku,
      nome: p.nome,
      ativo: p.ativo,
      cadastrado: item !== undefined,
      disponivel: item?.disponivel ?? 0,
      reservado: item?.reservado ?? 0,
      baixo: item ? item.estoqueBaixo : true,
    };
  });
  const conhecidos = new Set(produtos.map((p) => p.id));
  for (const item of itens) {
    if (conhecidos.has(item.produtoId)) continue;
    linhas.push({
      produtoId: item.produtoId,
      sku: '—',
      nome: `Produto ${item.produtoId.slice(0, 8)}`,
      ativo: true,
      cadastrado: true,
      disponivel: item.disponivel,
      reservado: item.reservado,
      baixo: item.estoqueBaixo,
    });
  }
  return linhas.sort((a, b) => a.disponivel - b.disponivel || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filtrarLinhas(linhas: LinhaDeEstoque[], busca: string, somenteBaixo: boolean): LinhaDeEstoque[] {
  const procurado = normalizar(busca.trim());
  return linhas.filter(
    (l) => (!somenteBaixo || l.baixo) && (procurado === '' || normalizar(`${l.nome} ${l.sku}`).includes(procurado)),
  );
}

/** Troca o saldo de uma linha pelo que o servidor devolveu depois do ajuste. */
export function aplicarItem(linhas: LinhaDeEstoque[], item: ItemEstoque): LinhaDeEstoque[] {
  return linhas.map((l) =>
    l.produtoId === item.produtoId
      ? { ...l, cadastrado: true, disponivel: item.disponivel, reservado: item.reservado, baixo: item.estoqueBaixo }
      : l,
  );
}

/** Quanto sobra no disponível depois do ajuste, só para a prévia na tela; o servidor é quem calcula de verdade. */
export function saldoDepois(disponivel: number, tipo: TipoDeAjuste, quantidade: number): number {
  if (tipo === 'ENTRADA') return disponivel + quantidade;
  if (tipo === 'PERDA') return disponivel - quantidade;
  return quantidade;
}

/** Confere o ajuste antes de enviar; devolve a mensagem de erro ou null. `texto` é o que foi digitado. */
export function validarAjuste(tipo: TipoDeAjuste, texto: string, disponivel: number): string | null {
  const digitado = texto.trim();
  if (digitado === '') return 'Informe a quantidade.';
  const quantidade = Number(digitado);
  if (!Number.isInteger(quantidade)) return 'Use um número inteiro.';
  if (tipo === 'CORRECAO') return quantidade < 0 ? 'O saldo não pode ser negativo.' : null;
  if (quantidade < 1) return 'A quantidade deve ser de 1 em diante.';
  if (tipo === 'PERDA' && quantidade > disponivel) return `A perda não pode passar do disponível (${disponivel}).`;
  return null;
}
