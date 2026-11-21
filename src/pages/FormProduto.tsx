import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input } from '@ruan-diego/mini-design-system';
import { atualizarProduto, cadastrarProduto, enviarImagem, type Categoria, type Produto } from '../api/catalogo';
import { useAdmin } from '../contexto';
import {
  FORMULARIO_VAZIO,
  MAXIMO_IMAGENS,
  campoDoErro,
  formularioDe,
  paraDados,
  validar,
  validarArquivo,
  type CampoDoProduto,
  type ErrosDoProduto,
  type FormularioDeProduto,
} from '../produtos';

interface Props {
  /** Produto em edição; ausente = cadastro. */
  produto?: Produto;
  categorias: Categoria[];
  /** Chamado depois de salvar. No cadastro, `permanecer` mantém o formulário aberto (para enviar imagens). */
  onSalvo: (produto: Produto, opcoes: { permanecer: boolean }) => void;
  onCancelar: () => void;
}

/**
 * Cadastro e edição de produto. Valida antes de enviar e põe cada erro no próprio campo; os erros do backend também
 * (o 409 de SKU repetido cai no campo SKU). O upload de imagem precisa do id do produto, então só existe depois do
 * cadastro: ao criar, o formulário continua aberto, agora em modo edição, com o envio de imagens liberado.
 */
export function FormProduto({ produto: inicial, categorias, onSalvo, onCancelar }: Props) {
  const { getToken } = useAdmin();
  const [produto, setProduto] = useState<Produto | undefined>(inicial);
  const cadastro = produto === undefined;
  const [dados, setDados] = useState<FormularioDeProduto>(inicial ? formularioDe(inicial) : FORMULARIO_VAZIO);
  const [erros, setErros] = useState<ErrosDoProduto>({});
  const [erroGeral, setErroGeral] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [textoNovaImagem, setTextoNovaImagem] = useState('');
  const [erroImagem, setErroImagem] = useState('');
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  const campo = (nome: 'sku' | 'nome' | 'descricao' | 'preco') => ({
    value: dados[nome],
    erro: erros[nome],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDados((d) => ({ ...d, [nome]: e.target.value })),
  });

  function mostrarErroDoServidor(erro: unknown) {
    const onde: CampoDoProduto | null = campoDoErro(erro);
    const mensagem = erro instanceof Error ? erro.message : 'Não foi possível salvar o produto.';
    if (onde) setErros({ [onde]: mensagem });
    else setErroGeral(mensagem);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (salvando) return;
    const encontrados = validar(dados, cadastro);
    setErros(encontrados);
    setErroGeral('');
    setAviso('');
    if (Object.keys(encontrados).length > 0) return;

    setSalvando(true);
    try {
      const corpo = paraDados(dados, cadastro);
      if (produto) {
        await atualizarProduto(getToken, produto.id, corpo);
        const atualizado: Produto = { ...produto, nome: corpo.nome, descricao: corpo.descricao, preco: corpo.preco, imagens: corpo.imagens, categoriaId: corpo.categoriaId };
        setProduto(atualizado);
        setAviso('Produto atualizado.');
        onSalvo(atualizado, { permanecer: false });
      } else {
        const { id } = await cadastrarProduto(getToken, corpo);
        const criado: Produto = {
          id,
          sku: corpo.sku ?? '',
          nome: corpo.nome,
          slug: '',
          descricao: corpo.descricao,
          preco: corpo.preco,
          imagens: corpo.imagens,
          categoriaId: corpo.categoriaId,
          ativo: true,
        };
        setProduto(criado);
        setAviso('Produto cadastrado. Agora você pode enviar imagens.');
        onSalvo(criado, { permanecer: true });
      }
    } catch (erro) {
      mostrarErroDoServidor(erro);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarArquivo() {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!produto || !arquivo || enviando) return;
    setErroImagem('');
    const problema = validarArquivo(arquivo, dados.imagens.length);
    if (problema) return setErroImagem(problema);
    if (!textoNovaImagem.trim()) return setErroImagem('Escreva o texto alternativo da imagem.');

    setEnviando(true);
    try {
      // O servidor já acrescenta a imagem à galeria; o formulário a guarda também para o próximo "Salvar" (PUT)
      // não a perder, já que o PUT substitui a lista inteira de imagens.
      const imagem = await enviarImagem(getToken, produto.id, arquivo, arquivo.name, textoNovaImagem.trim());
      setDados((d) => ({ ...d, imagens: [...d.imagens, imagem] }));
      setProduto({ ...produto, imagens: [...dados.imagens, imagem] });
      setTextoNovaImagem('');
      if (arquivoRef.current) arquivoRef.current.value = '';
      setAviso('Imagem enviada.');
    } catch (erro) {
      setErroImagem(erro instanceof Error ? erro.message : 'Não foi possível enviar a imagem.');
    } finally {
      setEnviando(false);
    }
  }

  function removerImagem(indice: number) {
    setDados((d) => ({ ...d, imagens: d.imagens.filter((_, i) => i !== indice) }));
    setAviso('Imagem removida. Clique em Salvar para confirmar.');
  }

  return (
    <form className="card form-produto" onSubmit={enviar} noValidate aria-labelledby="form-produto-titulo">
      <h2 id="form-produto-titulo" className="h3" ref={tituloRef} tabIndex={-1}>
        {cadastro ? 'Novo produto' : `Editar ${produto.nome}`}
      </h2>
      <p className="sr" role="status" aria-live="polite">
        {aviso}
      </p>
      {erroGeral && (
        <p role="alert" className="erro-form">
          {erroGeral}
        </p>
      )}

      <div className="form-grade">
        <div className="f-2">
          <Input label="SKU" disabled={!cadastro} {...campo('sku')} />
        </div>
        <div className="f-4">
          <Input label="Nome" {...campo('nome')} />
        </div>
        <div className="f-6">
          <Input label="Descrição (opcional)" {...campo('descricao')} />
        </div>
        <div className="f-3">
          <Input label="Preço (R$)" inputMode="decimal" {...campo('preco')} />
        </div>
        <div className="f-3">
          <div className="field">
            <label htmlFor="produto-categoria">Categoria</label>
            <select
              id="produto-categoria"
              className={`input${erros.categoriaId ? ' err' : ''}`}
              value={dados.categoriaId}
              aria-invalid={erros.categoriaId ? true : undefined}
              aria-describedby={erros.categoriaId ? 'produto-categoria-erro' : undefined}
              onChange={(e) => setDados((d) => ({ ...d, categoriaId: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {erros.categoriaId && (
              <span id="produto-categoria-erro" className="hint-err">
                {erros.categoriaId}
              </span>
            )}
          </div>
        </div>
      </div>

      <fieldset className="imagens">
        <legend className="h4">
          Imagens ({dados.imagens.length} de {MAXIMO_IMAGENS})
        </legend>
        {erros.imagens && (
          <span role="alert" className="hint-err">
            {erros.imagens}
          </span>
        )}
        {dados.imagens.length === 0 && <p className="muted">Nenhuma imagem ainda.</p>}
        <ul className="lista-imagens">
          {dados.imagens.map((imagem, i) => (
            <li key={`${imagem.url}-${i}`}>
              <img src={imagem.url} alt={imagem.textoAlternativo} width={56} height={56} />
              <span className="muted">{imagem.textoAlternativo}</span>
              <Button type="button" pequeno variante="ghost" onClick={() => removerImagem(i)}>
                Remover{' '}<span className="sr">imagem {imagem.textoAlternativo}</span>
              </Button>
            </li>
          ))}
        </ul>

        {cadastro ? (
          <p className="muted">Salve o produto para poder enviar imagens.</p>
        ) : (
          <div className="envio-imagem">
            <div className="field">
              <label htmlFor="produto-arquivo">Arquivo (JPEG, PNG ou WebP, até 2 MB)</label>
              <input id="produto-arquivo" ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" />
            </div>
            <Input label="Texto alternativo" value={textoNovaImagem} onChange={(e) => setTextoNovaImagem(e.target.value)} />
            <Button type="button" variante="secundario" onClick={enviarArquivo} disabled={enviando || dados.imagens.length >= MAXIMO_IMAGENS}>
              {enviando ? 'Enviando…' : 'Enviar imagem'}
            </Button>
            {erroImagem && (
              <span role="alert" className="hint-err">
                {erroImagem}
              </span>
            )}
          </div>
        )}
      </fieldset>

      <div className="form-acoes">
        <Button type="button" variante="secundario" onClick={onCancelar}>
          {cadastro ? 'Cancelar' : 'Fechar'}
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
