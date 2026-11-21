/**
 * Produtos, no catalogo-service. A leitura é a vitrine pública (só produtos ativos); cadastrar, atualizar,
 * desativar e enviar imagem são `/admin/**` (papel admin). Produto nunca é apagado: pedidos antigos apontam
 * para ele, então "excluir" é desativar.
 */
import { chamar, comQuery, type ObterToken } from './http';
import type { Pagina } from './pedidos';

export interface ImagemProduto {
  url: string;
  textoAlternativo: string;
}

export interface Produto {
  id: string;
  sku: string;
  nome: string;
  slug: string;
  descricao: string;
  preco: number;
  imagens: ImagemProduto[];
  categoriaId: string;
  ativo: boolean;
}

/** Corpo do POST e do PUT. `sku` e `slug` só valem no cadastro (não mudam depois); sem `slug`, ele sai do nome. */
export interface DadosDoProduto {
  sku?: string;
  nome: string;
  slug?: string;
  descricao: string;
  preco: number;
  imagens: ImagemProduto[];
  categoriaId: string;
}

/**
 * Lista do admin: todos os produtos, inclusive desativados (`ativo: false`), por nome. A busca por texto acha no
 * nome, na descrição ou no SKU. Páginas começam em 0 (tamanho de 1 a 100, padrão 20).
 */
export const listarProdutos = (obterToken: ObterToken, busca?: string, pagina?: number, tamanho?: number, sinal?: AbortSignal) =>
  chamar<Pagina<Produto>>('GET', comQuery('/catalogo/admin/produtos', { busca, pagina, tamanho }), obterToken, { sinal });

/** SKU (ou slug) repetido responde 409 com o motivo em `detail` e o campo em `campo` ("sku" ou "slug"). */
export const cadastrarProduto = (obterToken: ObterToken, dados: DadosDoProduto) =>
  chamar<{ id: string }>('POST', '/catalogo/admin/produtos', obterToken, { corpo: dados });

export const atualizarProduto = (obterToken: ObterToken, id: string, dados: DadosDoProduto) =>
  chamar<void>('PUT', `/catalogo/admin/produtos/${encodeURIComponent(id)}`, obterToken, { corpo: dados });

export const desativarProduto = (obterToken: ObterToken, id: string) =>
  chamar<void>('DELETE', `/catalogo/admin/produtos/${encodeURIComponent(id)}`, obterToken);

/**
 * Envia uma imagem (JPEG, PNG ou WebP, até 2 MB); vai para o fim da galeria, que aceita até 5. O arquivo vai em
 * multipart (`arquivo`) e o texto alternativo na query: o endpoint lê `textoAlternativo` como @RequestParam, que o
 * Spring aceita nos dois lugares, e o Pact só consegue gravar a parte do arquivo no corpo multipart.
 */
export function enviarImagem(obterToken: ObterToken, id: string, arquivo: Blob, nomeDoArquivo: string, textoAlternativo: string) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo, nomeDoArquivo);
  return chamar<ImagemProduto>(
    'POST',
    comQuery(`/catalogo/admin/produtos/${encodeURIComponent(id)}/imagens`, { textoAlternativo }),
    obterToken,
    { formulario },
  );
}

export interface Categoria {
  id: string;
  nome: string;
  slug: string;
  /** Nulo = categoria raiz. */
  paiId: string | null;
}

/** Categorias em ordem alfabética (leitura pública da vitrine, para o seletor do formulário). */
export const listarCategorias = (obterToken: ObterToken, sinal?: AbortSignal) =>
  chamar<Categoria[]>('GET', '/catalogo/categorias', obterToken, { sinal });
