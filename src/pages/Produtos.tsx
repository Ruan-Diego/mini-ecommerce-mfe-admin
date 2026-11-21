import { useState, type FormEvent } from 'react';
import { Button, Pill } from '@ruan-diego/mini-design-system';
import { desativarProduto, listarCategorias, listarProdutos, type Produto } from '../api/catalogo';
import { useAdmin } from '../contexto';
import { formatarMoeda } from '../formato';
import { useRecurso } from '../useRecurso';
import { FormProduto } from './FormProduto';
import { Proibido } from './Proibido';

const POR_PAGINA = 20;

/** null = nenhum formulário aberto; 'novo' = cadastro; Produto = edição daquele produto. */
type Edicao = null | 'novo' | Produto;

/**
 * Produtos: lista paginada (20 por página, no servidor) com busca por nome ou SKU, cadastro e edição com upload
 * de até 5 imagens, e desativar (nunca excluir: pedidos antigos apontam para o produto). A lista do admin traz os
 * desativados, que ficam esmaecidos e sem o botão de desativar.
 */
export function Produtos() {
  const { getToken } = useAdmin();
  const [digitado, setDigitado] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [erroAcao, setErroAcao] = useState('');

  const lista = useRecurso((sinal) => listarProdutos(getToken, busca, pagina, POR_PAGINA, sinal), `${busca}|${pagina}`);
  const categorias = useRecurso((sinal) => listarCategorias(getToken, sinal), getToken);

  if (lista.estado === 'erro' && lista.status === 403) return <Proibido />;

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setPagina(0);
    setBusca(digitado.trim());
  }

  async function desativar(produto: Produto) {
    setErroAcao('');
    try {
      await desativarProduto(getToken, produto.id);
      setConfirmando(null);
      setAviso(`${produto.nome} foi desativado.`);
      if (lista.estado === 'pronto') lista.recarregar();
    } catch (erro) {
      setErroAcao(erro instanceof Error ? erro.message : 'Não foi possível desativar o produto.');
    }
  }

  const listaDeCategorias = categorias.estado === 'pronto' ? categorias.dados : [];
  const nomeDaCategoria = (id: string) => listaDeCategorias.find((c) => c.id === id)?.nome ?? '—';

  return (
    <>
      <div className="produtos-topo">
        <h1 className="h2 admin-titulo">Produtos</h1>
        <Button onClick={() => setEdicao('novo')} disabled={edicao !== null || categorias.estado !== 'pronto'}>
          + Novo produto
        </Button>
      </div>
      <p className="sr" role="status" aria-live="polite">
        {aviso}
      </p>

      {categorias.estado === 'erro' && (
        <p role="alert" className="erro-form">
          Não foi possível carregar as categorias, então o cadastro está indisponível.{' '}
          <button type="button" className="link" onClick={categorias.tentarDeNovo}>
            Tentar de novo
          </button>
        </p>
      )}

      {edicao !== null && (
        <FormProduto
          key={edicao === 'novo' ? 'novo' : edicao.id}
          produto={edicao === 'novo' ? undefined : edicao}
          categorias={listaDeCategorias}
          onSalvo={(produto, { permanecer }) => {
            setAviso(permanecer ? `${produto.nome} foi cadastrado.` : `${produto.nome} foi atualizado.`);
            if (lista.estado === 'pronto') lista.recarregar();
            if (!permanecer) setEdicao(null);
          }}
          onCancelar={() => setEdicao(null)}
        />
      )}

      <form className="busca-produtos" role="search" onSubmit={buscar}>
        <div className="field">
          <label htmlFor="busca-produtos">Buscar por nome ou SKU</label>
          <input
            id="busca-produtos"
            type="search"
            className="input"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
          />
        </div>
        <Button type="submit" variante="secundario">
          Buscar
        </Button>
      </form>

      {erroAcao && (
        <p role="alert" className="erro-form">
          {erroAcao}
        </p>
      )}

      {lista.estado === 'carregando' && <div role="status" aria-label="Carregando produtos" className="card esqueleto" style={{ height: 240 }} />}

      {lista.estado === 'erro' && (
        <div className="card estado" role="alert">
          <p className="h4">Não foi possível carregar os produtos.</p>
          <p className="muted">{lista.mensagem}</p>
          <Button onClick={lista.tentarDeNovo}>Tentar de novo</Button>
        </div>
      )}

      {lista.estado === 'pronto' &&
        (lista.dados.itens.length === 0 ? (
          <div className="card estado">
            <p className="h4">{busca ? `Nenhum produto para “${busca}”.` : 'Nenhum produto cadastrado ainda.'}</p>
          </div>
        ) : (
          <>
            <div className="card tabela-rolavel">
              <table className="tabela">
                <caption className="sr">Produtos</caption>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Nome</th>
                    <th scope="col">Categoria</th>
                    <th scope="col" className="num">
                      Preço
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.dados.itens.map((produto) => (
                    <tr key={produto.id} className={produto.ativo ? undefined : 'linha-desativada'}>
                      <th scope="row" className="mono">
                        {produto.sku}
                      </th>
                      <td>{produto.nome}</td>
                      <td>{nomeDaCategoria(produto.categoriaId)}</td>
                      <td className="num">{formatarMoeda(produto.preco)}</td>
                      <td>
                        <Pill tom={produto.ativo ? 'sucesso' : 'neutro'}>{produto.ativo ? 'Ativo' : 'Desativado'}</Pill>
                      </td>
                      <td>
                        {confirmando === produto.id ? (
                          <div className="acoes-linha" role="group" aria-label={`Confirmar desativação de ${produto.nome}`}>
                            <span>Desativar?</span>
                            <Button pequeno variante="secundario" onClick={() => setConfirmando(null)}>
                              Manter
                            </Button>
                            <Button pequeno variante="ghost" className="btn-perigo" onClick={() => desativar(produto)}>
                              Sim, desativar
                            </Button>
                          </div>
                        ) : (
                          <div className="acoes-linha">
                            <Button pequeno variante="secundario" onClick={() => setEdicao(produto)} disabled={edicao !== null}>
                              Editar{' '}<span className="sr">{produto.nome}</span>
                            </Button>
                            {produto.ativo && (
                              <Button pequeno variante="ghost" onClick={() => setConfirmando(produto.id)}>
                                Desativar{' '}<span className="sr">{produto.nome}</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lista.dados.totalPaginas > 1 && (
              <nav className="paginacao" aria-label="Paginação">
                <Button variante="secundario" pequeno disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Button>
                <span aria-live="polite">
                  Página {pagina + 1} de {lista.dados.totalPaginas}
                </span>
                <Button variante="secundario" pequeno disabled={pagina + 1 >= lista.dados.totalPaginas} onClick={() => setPagina(pagina + 1)}>
                  Próxima
                </Button>
              </nav>
            )}
          </>
        ))}
    </>
  );
}
