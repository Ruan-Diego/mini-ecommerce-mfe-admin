import { ErroDeApi } from './api/http';
import type { DadosDoProduto, ImagemProduto, Produto } from './api/catalogo';

/** Limites do backend (domínio): a tela confere antes de enviar, o backend continua sendo a palavra final. */
export const MAXIMO_IMAGENS = 5;
export const TAMANHO_MAXIMO_IMAGEM = 2 * 1024 * 1024;
export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type CampoDoProduto = 'sku' | 'nome' | 'descricao' | 'preco' | 'categoriaId' | 'imagens';
export type ErrosDoProduto = Partial<Record<CampoDoProduto, string>>;

/** O formulário guarda tudo como texto (o preço é digitado). */
export interface FormularioDeProduto {
  sku: string;
  nome: string;
  descricao: string;
  preco: string;
  categoriaId: string;
  imagens: ImagemProduto[];
}

export const FORMULARIO_VAZIO: FormularioDeProduto = { sku: '', nome: '', descricao: '', preco: '', categoriaId: '', imagens: [] };

export function formularioDe(produto: Produto): FormularioDeProduto {
  return {
    sku: produto.sku,
    nome: produto.nome,
    descricao: produto.descricao,
    preco: String(produto.preco).replace('.', ','),
    categoriaId: produto.categoriaId,
    imagens: produto.imagens,
  };
}

/** "289,90" ou "289.90" → 289.9; texto que não é número positivo → NaN. */
export function lerPreco(texto: string): number {
  const digitado = texto.trim();
  // Com vírgula, o ponto é separador de milhar ("1.289,90"); sem vírgula, o ponto é o decimal ("289.90").
  const normal = digitado.includes(',') ? digitado.replace(/\./g, '').replace(',', '.') : digitado;
  return normal === '' ? Number.NaN : Number(normal);
}

/** Confere o que dá para conferir sem o servidor. SKU só vale no cadastro (não muda depois). */
export function validar(dados: FormularioDeProduto, cadastro: boolean): ErrosDoProduto {
  const erros: ErrosDoProduto = {};
  if (cadastro) {
    const sku = dados.sku.trim();
    if (!sku) erros.sku = 'Informe o SKU.';
    else if (sku.length < 3 || sku.length > 32) erros.sku = 'O SKU deve ter de 3 a 32 caracteres.';
    else if (!/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(sku)) erros.sku = 'Use só letras, números e hífens entre blocos.';
  }
  if (!dados.nome.trim()) erros.nome = 'Informe o nome.';
  const preco = lerPreco(dados.preco);
  if (!(preco > 0)) erros.preco = 'Informe um preço maior que zero.';
  if (!dados.categoriaId) erros.categoriaId = 'Escolha a categoria.';
  if (dados.imagens.length > MAXIMO_IMAGENS) erros.imagens = `Até ${MAXIMO_IMAGENS} imagens por produto.`;
  if (dados.imagens.some((i) => !i.textoAlternativo.trim())) erros.imagens = 'Toda imagem precisa de texto alternativo.';
  return erros;
}

export function paraDados(dados: FormularioDeProduto, cadastro: boolean): DadosDoProduto {
  return {
    ...(cadastro ? { sku: dados.sku.trim() } : {}),
    nome: dados.nome.trim(),
    descricao: dados.descricao.trim(),
    preco: lerPreco(dados.preco),
    imagens: dados.imagens,
    categoriaId: dados.categoriaId,
  };
}

/**
 * Em que campo mostrar o erro do backend. O 409 já diz o campo (`campo`: "sku" ou "slug"; o slug sai do nome, então o
 * erro aparece no Nome). Nos demais, a mensagem do domínio cita o assunto ("SKU deve ter...", "preço deve ser...").
 * Sem campo reconhecido devolve null e a tela mostra o erro acima do formulário.
 */
export function campoDoErro(erro: unknown): CampoDoProduto | null {
  if (!(erro instanceof ErroDeApi)) return null;
  if (erro.campo === 'sku') return 'sku';
  if (erro.campo === 'slug') return 'nome';
  const texto = erro.message.toLowerCase();
  if (texto.includes('sku')) return 'sku';
  if (texto.includes('preço')) return 'preco';
  if (texto.includes('imagem') || texto.includes('imagens')) return 'imagens';
  if (texto.includes('descrição')) return 'descricao';
  if (texto.includes('nome')) return 'nome';
  if (texto.includes('categoria')) return 'categoriaId';
  return null;
}

/** Confere o arquivo escolhido antes do upload; devolve a mensagem de erro ou null se pode enviar. */
export function validarArquivo(arquivo: { type: string; size: number }, imagensAtuais: number): string | null {
  if (imagensAtuais >= MAXIMO_IMAGENS) return `O produto já tem ${MAXIMO_IMAGENS} imagens.`;
  if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type)) return 'A imagem deve ser JPEG, PNG ou WebP.';
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) return 'A imagem deve ter até 2 MB.';
  return null;
}
