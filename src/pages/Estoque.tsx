import { useState, type FormEvent } from 'react';
import { Button, Chip, Input, Modal, Pill } from '@ruan-diego/mini-design-system';
import { listarTodosOsProdutos } from '../api/catalogo';
import { ajustarEstoque, indicadoresDeEstoque, listarEstoque, type TipoDeAjuste } from '../api/estoque';
import { useAdmin } from '../contexto';
import {
  ROTULO_AJUSTE,
  aplicarItem,
  filtrarLinhas,
  montarLinhas,
  saldoDepois,
  validarAjuste,
  type LinhaDeEstoque,
} from '../estoque';
import { useRecurso } from '../useRecurso';
import { Proibido } from './Proibido';

/**
 * Estoque: cada produto do catálogo com o saldo disponível e o reservado (o reservado é de pedidos ainda não pagos e
 * não pode ser mexido aqui), do menor saldo para o maior. "Abaixo de N" usa o limite e a regra do estoque-service.
 * O ajuste tem motivo: entrada e perda são relativas ao saldo de agora (o servidor soma ou subtrai com o item
 * travado, então não atropela pedidos que reservam ao mesmo tempo) e correção define o saldo depois de uma contagem.
 * O saldo que o servidor devolve entra na linha na hora; é o mesmo que a vitrine lê no Detalhe do produto.
 */
export function Estoque() {
  const { getToken } = useAdmin();
  const dados = useRecurso(async (sinal) => {
    const [produtos, itens, indicadores] = await Promise.all([
      listarTodosOsProdutos(getToken, sinal),
      listarEstoque(getToken, undefined, sinal),
      indicadoresDeEstoque(getToken, sinal),
    ]);
    return { linhas: montarLinhas(produtos, itens), limite: indicadores.limite };
  }, getToken);

  const [ajustes, setAjustes] = useState<Map<string, LinhaDeEstoque>>(new Map());
  const [busca, setBusca] = useState('');
  const [somenteBaixo, setSomenteBaixo] = useState(false);
  const [alvo, setAlvo] = useState<LinhaDeEstoque | null>(null);
  const [aviso, setAviso] = useState('');

  if (dados.estado === 'erro' && dados.status === 403) return <Proibido />;

  const linhas = dados.estado === 'pronto' ? dados.dados.linhas.map((l) => ajustes.get(l.produtoId) ?? l) : [];
  const visiveis = filtrarLinhas(linhas, busca, somenteBaixo);
  const quantosBaixos = linhas.filter((l) => l.baixo).length;

  return (
    <>
      <h1 className="h2 admin-titulo">Estoque</h1>
      <p className="sr" role="status" aria-live="polite">
        {aviso}
      </p>

      {dados.estado === 'carregando' && <div role="status" aria-label="Carregando estoque" className="card esqueleto" style={{ height: 280 }} />}

      {dados.estado === 'erro' && (
        <div className="card estado" role="alert">
          <p className="h4">Não foi possível carregar o estoque.</p>
          <p className="muted">{dados.mensagem}</p>
          <Button onClick={dados.tentarDeNovo}>Tentar de novo</Button>
        </div>
      )}

      {dados.estado === 'pronto' && (
        <>
          <div className="filtros-estoque">
            <div className="field busca-estoque">
              <label htmlFor="busca-estoque">Buscar por nome ou SKU</label>
              <input id="busca-estoque" type="search" className="input" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div role="group" aria-label="Filtrar por saldo" className="chips-estoque">
              <Chip ativo={!somenteBaixo} onClick={() => setSomenteBaixo(false)}>
                Todos
              </Chip>
              <Chip ativo={somenteBaixo} onClick={() => setSomenteBaixo(true)}>
                Abaixo de {dados.dados.limite} ({quantosBaixos})
              </Chip>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <div className="card estado">
              <p className="h4">
                {linhas.length === 0
                  ? 'Nenhum produto cadastrado ainda.'
                  : somenteBaixo && busca.trim() === ''
                    ? `Nenhum produto abaixo de ${dados.dados.limite}.`
                    : 'Nenhum produto encontrado.'}
              </p>
            </div>
          ) : (
            <div className="card tabela-rolavel">
              <table className="tabela">
                <caption className="sr">Estoque por produto</caption>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Produto</th>
                    <th scope="col" className="num">
                      Disponível
                    </th>
                    <th scope="col" className="num">
                      Reservado
                    </th>
                    <th scope="col">Situação</th>
                    <th scope="col">
                      <span className="sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((linha) => (
                    <tr key={linha.produtoId} className={linha.ativo ? undefined : 'linha-desativada'}>
                      <th scope="row" className="mono">
                        {linha.sku}
                      </th>
                      <td>
                        {linha.nome}
                        {!linha.ativo && <span className="muted"> (desativado)</span>}
                      </td>
                      <td className="num">{linha.disponivel}</td>
                      <td className="num">{linha.reservado}</td>
                      <td>
                        {!linha.cadastrado ? (
                          <Pill tom="erro">Sem estoque cadastrado</Pill>
                        ) : linha.disponivel === 0 ? (
                          <Pill tom="erro">Esgotado</Pill>
                        ) : linha.baixo ? (
                          <Pill tom="aviso">Estoque baixo</Pill>
                        ) : (
                          <Pill tom="sucesso">Ok</Pill>
                        )}
                      </td>
                      <td>
                        <Button pequeno variante="secundario" onClick={() => setAlvo(linha)}>
                          Ajustar{' '}
                          <span className="sr">{linha.nome}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {alvo && (
        <FormAjuste
          key={alvo.produtoId}
          linha={ajustes.get(alvo.produtoId) ?? alvo}
          onFechar={() => setAlvo(null)}
          onAjustado={(atualizada, mensagem) => {
            setAjustes((anteriores) => new Map(anteriores).set(atualizada.produtoId, atualizada));
            setAviso(mensagem);
            setAlvo(null);
          }}
        />
      )}
    </>
  );
}

interface PropsAjuste {
  linha: LinhaDeEstoque;
  onFechar: () => void;
  onAjustado: (linha: LinhaDeEstoque, mensagem: string) => void;
}

/** Modal de ajuste com motivo. A prévia ("3 → 8") é só uma conta de tela; o saldo final vem do servidor. */
function FormAjuste({ linha, onFechar, onAjustado }: PropsAjuste) {
  const { getToken } = useAdmin();
  const [tipo, setTipo] = useState<TipoDeAjuste>('ENTRADA');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const quantidade = Number(texto.trim());
  const previa = texto.trim() !== '' && Number.isInteger(quantidade) ? saldoDepois(linha.disponivel, tipo, quantidade) : null;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const problema = validarAjuste(tipo, texto, linha.disponivel);
    setErro(problema ?? '');
    if (problema) return;

    setEnviando(true);
    try {
      const item = await ajustarEstoque(getToken, linha.produtoId, tipo, quantidade);
      onAjustado(aplicarItem([linha], item)[0], `Estoque de ${linha.nome} ajustado: ${item.disponivel} disponíveis.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ajustar o estoque.');
      setEnviando(false);
    }
  }

  return (
    <Modal aberto titulo={`Ajustar estoque de ${linha.nome}`} aoFechar={() => !enviando && onFechar()}>
      <form className="form-ajuste" onSubmit={enviar} noValidate>
        <p className="muted">
          Disponível agora: <strong>{linha.disponivel}</strong> · Reservado: <strong>{linha.reservado}</strong>
        </p>
        <div className="field">
          <label htmlFor="ajuste-motivo">Motivo</label>
          <select id="ajuste-motivo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeAjuste)}>
            {(Object.keys(ROTULO_AJUSTE) as TipoDeAjuste[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_AJUSTE[t]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label={tipo === 'CORRECAO' ? 'Saldo correto' : 'Quantidade'}
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          erro={erro && !enviando ? erro : undefined}
        />
        {previa !== null && previa >= 0 && (
          <p aria-live="polite">
            Disponível: {linha.disponivel} → <strong>{previa}</strong>
          </p>
        )}
        <div className="form-acoes">
          <Button type="button" variante="secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar ajuste'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
