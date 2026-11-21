import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Input, Pill } from '@ruan-diego/mini-design-system';
import { alterarStatus, listarPedidos, type PedidoAdmin, type StatusPedido } from '../api/pedidos';
import { useAdmin } from '../contexto';
import { ROTULO_STATUS, TOM_STATUS, formatarDataHora, formatarMoeda, numeroDoPedido } from '../formato';
import {
  ROTULO_DA_ACAO,
  STATUS_DO_FILTRO,
  acoesDoPedido,
  validarPeriodo,
  validarRastreio,
} from '../pedidosAdmin';
import { useRecurso } from '../useRecurso';
import { Proibido } from './Proibido';

const POR_PAGINA = 20;

/**
 * Pedidos do admin: lista paginada no servidor (20 por página, mais recentes primeiro) com filtro por status
 * (vários) e por período, e o detalhe em um painel ao lado. O painel só oferece as transições que o servidor manda em
 * `transicoesPermitidas`; ENVIADO pede o código de rastreio. O pedido devolvido pelo servidor entra na lista na hora.
 */
export function Pedidos() {
  const { getToken } = useAdmin();
  const [status, setStatus] = useState<StatusPedido[]>([]);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [alterados, setAlterados] = useState<Map<string, PedidoAdmin>>(new Map());
  const [aviso, setAviso] = useState('');

  const erroDePeriodo = validarPeriodo(de, ate);
  const filtro = { status, de: erroDePeriodo ? undefined : de, ate: erroDePeriodo ? undefined : ate };
  const lista = useRecurso(
    (sinal) => listarPedidos(getToken, { ...filtro, pagina, tamanho: POR_PAGINA }, sinal),
    `${status.join(',')}|${filtro.de}|${filtro.ate}|${pagina}`,
  );

  if (lista.estado === 'erro' && lista.status === 403) return <Proibido />;

  const pedidos = lista.estado === 'pronto' ? lista.dados.itens.map((p) => alterados.get(p.id) ?? p) : [];
  const selecionado = pedidos.find((p) => p.id === aberto) ?? null;

  function alternarStatus(s: StatusPedido) {
    setStatus((atuais) => (atuais.includes(s) ? atuais.filter((x) => x !== s) : [...atuais, s]));
    setPagina(0);
  }

  return (
    <>
      <h1 className="h2 admin-titulo">Pedidos</h1>
      <p className="sr" role="status" aria-live="polite">
        {aviso}
      </p>

      <div className="filtros-pedidos">
        <div role="group" aria-label="Filtrar por status" className="chips-pedidos">
          {STATUS_DO_FILTRO.map((s) => (
            <Chip key={s} ativo={status.includes(s)} onClick={() => alternarStatus(s)}>
              {ROTULO_STATUS[s]}
            </Chip>
          ))}
        </div>
        <div className="periodo">
          <Input label="De" type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(0); }} />
          <Input label="Até" type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(0); }} erro={erroDePeriodo ?? undefined} />
        </div>
      </div>

      <div className={`pedidos-layout${selecionado ? ' com-painel' : ''}`}>
        <div className="pedidos-lista">
          {lista.estado === 'carregando' && <div role="status" aria-label="Carregando pedidos" className="card esqueleto" style={{ height: 240 }} />}

          {lista.estado === 'erro' && (
            <div className="card estado" role="alert">
              <p className="h4">Não foi possível carregar os pedidos.</p>
              <p className="muted">{lista.mensagem}</p>
              <Button onClick={lista.tentarDeNovo}>Tentar de novo</Button>
            </div>
          )}

          {lista.estado === 'pronto' &&
            (pedidos.length === 0 ? (
              <div className="card estado">
                <p className="h4">{status.length > 0 || de || ate ? 'Nenhum pedido com esses filtros.' : 'Nenhum pedido ainda.'}</p>
              </div>
            ) : (
              <>
                <div className="card tabela-rolavel">
                  <table className="tabela">
                    <caption className="sr">Pedidos, do mais recente para o mais antigo</caption>
                    <thead>
                      <tr>
                        <th scope="col">Pedido</th>
                        <th scope="col">Cliente</th>
                        <th scope="col">Data</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="num">
                          Total
                        </th>
                        <th scope="col">
                          <span className="sr">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidos.map((pedido) => (
                        <tr key={pedido.id} className={pedido.id === aberto ? 'linha-aberta' : undefined}>
                          <th scope="row">{numeroDoPedido(pedido.id)}</th>
                          <td className="mono">{pedido.clienteId.slice(0, 8)}</td>
                          <td>{formatarDataHora(pedido.criadoEm)}</td>
                          <td>
                            <Pill tom={TOM_STATUS[pedido.status]}>{ROTULO_STATUS[pedido.status]}</Pill>
                          </td>
                          <td className="num">{formatarMoeda(pedido.total)}</td>
                          <td>
                            <Button pequeno variante="secundario" aria-pressed={pedido.id === aberto} onClick={() => setAberto(pedido.id)}>
                              Abrir{' '}
                              <span className="sr">pedido {numeroDoPedido(pedido.id)}</span>
                            </Button>
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
        </div>

        {selecionado && (
          <PainelDoPedido
            key={selecionado.id}
            pedido={selecionado}
            onFechar={() => setAberto(null)}
            onAlterado={(atualizado) => {
              setAlterados((anteriores) => new Map(anteriores).set(atualizado.id, atualizado));
              setAviso(`Pedido ${numeroDoPedido(atualizado.id)}: ${ROTULO_STATUS[atualizado.status]}.`);
            }}
          />
        )}
      </div>
    </>
  );
}

interface PropsPainel {
  pedido: PedidoAdmin;
  onFechar: () => void;
  onAlterado: (pedido: PedidoAdmin) => void;
}

/** Detalhe ao lado da lista, com as ações de status. O foco vai para o título quando o painel abre. */
function PainelDoPedido({ pedido, onFechar, onAlterado }: PropsPainel) {
  const { getToken } = useAdmin();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [pedindoRastreio, setPedindoRastreio] = useState(false);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [rastreio, setRastreio] = useState('');
  const [erroRastreio, setErroRastreio] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  async function aplicar(destino: StatusPedido, codigo?: string) {
    if (enviando) return;
    setEnviando(true);
    setErro('');
    try {
      onAlterado(await alterarStatus(getToken, pedido.id, destino, codigo));
      setPedindoRastreio(false);
      setConfirmandoCancelamento(false);
      setRastreio('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar o status.');
    } finally {
      setEnviando(false);
    }
  }

  function escolher(destino: StatusPedido) {
    setErro('');
    if (destino === 'ENVIADO') {
      setConfirmandoCancelamento(false);
      setPedindoRastreio(true);
    } else if (destino === 'CANCELADO') {
      setPedindoRastreio(false);
      setConfirmandoCancelamento(true);
    } else {
      void aplicar(destino);
    }
  }

  function enviarComRastreio() {
    const problema = validarRastreio(rastreio);
    setErroRastreio(problema ?? '');
    if (!problema) void aplicar('ENVIADO', rastreio.trim());
  }

  const acoes = acoesDoPedido(pedido);

  return (
    <aside className="card painel-pedido" aria-labelledby="painel-pedido-titulo">
      <div className="painel-topo">
        <h2 id="painel-pedido-titulo" className="h3" ref={tituloRef} tabIndex={-1}>
          Pedido {numeroDoPedido(pedido.id)}
        </h2>
        <Button pequeno variante="ghost" onClick={onFechar}>
          Fechar painel
        </Button>
      </div>
      <Pill tom={TOM_STATUS[pedido.status]}>{ROTULO_STATUS[pedido.status]}</Pill>
      <p className="muted">
        Feito em {formatarDataHora(pedido.criadoEm)} · cliente <span className="mono">{pedido.clienteId.slice(0, 8)}</span>
      </p>
      {pedido.codigoRastreio && (
        <p>
          Código de rastreio: <span className="mono">{pedido.codigoRastreio}</span>
        </p>
      )}

      <h3 className="h4">Itens</h3>
      <ul className="itens-painel">
        {pedido.itens.map((item) => (
          <li key={item.produtoId}>
            {item.quantidade} × {item.nome} <span className="muted">({formatarMoeda(item.subtotal)})</span>
          </li>
        ))}
      </ul>

      <h3 className="h4">Entrega</h3>
      <address className="muted">
        {pedido.endereco.destinatario}
        <br />
        {pedido.endereco.logradouro}, {pedido.endereco.numero}
        {pedido.endereco.complemento ? `, ${pedido.endereco.complemento}` : ''}
        <br />
        {pedido.endereco.bairro} · {pedido.endereco.cidade}, {pedido.endereco.uf} · {pedido.endereco.cep}
      </address>
      <p className="muted">
        {pedido.frete.nome}: {pedido.frete.valor === 0 ? 'grátis' : formatarMoeda(pedido.frete.valor)}
      </p>
      <p className="painel-total">
        Total <strong>{formatarMoeda(pedido.total)}</strong>
      </p>

      {erro && (
        <p role="alert" className="erro-form">
          {erro}
        </p>
      )}

      {acoes.length === 0 ? (
        <p className="muted">Nenhuma ação disponível para este status.</p>
      ) : (
        <div className="acoes-painel" role="group" aria-label="Ações do pedido">
          {acoes.map((destino) => (
            <Button
              key={destino}
              variante={destino === 'CANCELADO' ? 'ghost' : 'secundario'}
              className={destino === 'CANCELADO' ? 'btn-perigo' : undefined}
              disabled={enviando}
              onClick={() => escolher(destino)}
            >
              {ROTULO_DA_ACAO[destino]}
            </Button>
          ))}
        </div>
      )}

      {pedindoRastreio && (
        <form
          className="form-rastreio"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            enviarComRastreio();
          }}
        >
          <Input label="Código de rastreio" value={rastreio} onChange={(e) => setRastreio(e.target.value)} erro={erroRastreio || undefined} />
          <div className="acoes-painel">
            <Button type="button" variante="secundario" onClick={() => setPedindoRastreio(false)} disabled={enviando}>
              Voltar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Confirmar envio'}
            </Button>
          </div>
        </form>
      )}

      {confirmandoCancelamento && (
        <div className="acoes-painel" role="group" aria-label="Confirmar cancelamento">
          <span>Cancelar este pedido?{pedido.status === 'PAGO' ? ' O pagamento será estornado.' : ''}</span>
          <Button variante="secundario" onClick={() => setConfirmandoCancelamento(false)} disabled={enviando}>
            Manter pedido
          </Button>
          <Button variante="ghost" className="btn-perigo" onClick={() => aplicar('CANCELADO')} disabled={enviando}>
            Sim, cancelar
          </Button>
        </div>
      )}
    </aside>
  );
}
