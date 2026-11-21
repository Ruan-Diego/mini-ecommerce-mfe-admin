/**
 * Cliente HTTP do mfe-admin, sempre pelo gateway: `VITE_API_URL` é a base (ex.: http://localhost:8080/api) e o
 * caminho leva o prefixo do serviço (`/pedidos`, `/estoque`, `/catalogo`). O token vem do shell (`props.getToken`);
 * toda rota `/admin/**` exige o papel admin (sem ele o gateway e o serviço respondem 403).
 */

/** Erro de HTTP com a explicação que o backend mandou (problem+json: detalhe). */
export class ErroDeApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    /** Campo do pedido que causou o erro, quando o backend diz (ex.: "sku" no 409 de SKU repetido). */
    readonly campo?: string,
  ) {
    super(mensagem);
  }
}

/** Fonte do token do shell (`props.getToken`): null enquanto não há login. */
export type ObterToken = () => Promise<string | null>;

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Opcoes {
  /** Corpo JSON (PUT, POST, PATCH). */
  corpo?: unknown;
  /** Corpo multipart (upload): o navegador põe o Content-Type com o boundary. */
  formulario?: FormData;
  sinal?: AbortSignal;
}

const baseUrl = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** O que mostrar ao admin: o `detail` do problem+json (e o `campo`, se vier) ou uma frase genérica. */
async function lerErro(resposta: Response): Promise<{ mensagem: string; campo?: string }> {
  try {
    const problema = (await resposta.json()) as { detail?: string; campo?: string };
    if (problema.detail) return { mensagem: problema.detail, campo: problema.campo };
  } catch {
    // corpo vazio ou que não é JSON: cai na frase genérica
  }
  if (resposta.status === 403) return { mensagem: 'você não tem permissão de administrador' };
  return { mensagem: `o servidor respondeu HTTP ${resposta.status}` };
}

/** Monta a query string sem os valores vazios; `status` repetível vira `status=A&status=B`. */
export function comQuery(caminho: string, params: Record<string, string | number | readonly string[] | undefined | null>) {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) query.append(chave, String(v));
  }
  const texto = query.toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

/** Devolve o JSON da resposta; 204 (sem corpo) devolve `undefined`. */
export async function chamar<T>(metodo: Metodo, caminho: string, obterToken: ObterToken, opcoes: Opcoes = {}): Promise<T> {
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  const token = await obterToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let corpo: BodyInit | undefined;
  if (opcoes.formulario) {
    corpo = opcoes.formulario;
  } else if (opcoes.corpo !== undefined) {
    cabecalhos['Content-Type'] = 'application/json';
    corpo = JSON.stringify(opcoes.corpo);
  }

  const resposta = await fetch(`${baseUrl()}${caminho}`, { method: metodo, headers: cabecalhos, body: corpo, signal: opcoes.sinal });
  if (!resposta.ok) {
    const { mensagem, campo } = await lerErro(resposta);
    throw new ErroDeApi(resposta.status, mensagem, campo);
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}
