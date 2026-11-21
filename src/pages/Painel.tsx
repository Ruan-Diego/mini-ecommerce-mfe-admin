import { Link } from 'react-router-dom';
import { Button, Pill } from '@ruan-diego/mini-design-system';
import { indicadoresDeEstoque } from '../api/estoque';
import { indicadoresDePedidos, listarPedidos } from '../api/pedidos';
import { useAdmin } from '../contexto';
import { ROTULO_STATUS, TOM_STATUS, formatarDataHora, formatarDia, formatarMoeda, numeroDoPedido } from '../formato';
import { useRecurso } from '../useRecurso';
import { Proibido } from './Proibido';

/** Quantos pedidos a lista de "últimos pedidos" mostra. */
const ULTIMOS = 10;

/**
 * Painel: quatro indicadores (pedidos de hoje, faturamento do dia e aguardando pagamento vêm do pedido-service;
 * estoque abaixo do limite vem do estoque-service, que é dono da regra) e os 10 últimos pedidos. As três chamadas
 * andam juntas: se qualquer uma responde 403 a tela inteira vira "Acesso negado"; outra falha vira erro com
 * "Tentar de novo" (um painel pela metade enganaria).
 */
export function Painel() {
  const { getToken } = useAdmin();
  const painel = useRecurso(async (sinal) => {
    const [pedidos, estoque, ultimos] = await Promise.all([
      indicadoresDePedidos(getToken, sinal),
      indicadoresDeEstoque(getToken, sinal),
      listarPedidos(getToken, { pagina: 0, tamanho: ULTIMOS }, sinal),
    ]);
    return { pedidos, estoque, ultimos: ultimos.itens };
  }, getToken);

  if (painel.estado === 'erro' && painel.status === 403) return <Proibido />;

  return (
    <>
      <h1 className="h2 admin-titulo">Painel</h1>

      {painel.estado === 'carregando' && (
        <div role="status" aria-label="Carregando painel" className="painel-esqueleto" aria-busy="true">
          <div className="grade-indicadores" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card indicador esqueleto" />
            ))}
          </div>
          <div className="card esqueleto" style={{ height: 280 }} aria-hidden="true" />
        </div>
      )}

      {painel.estado === 'erro' && (
        <div className="card estado" role="alert">
          <p className="h4">Não foi possível carregar o painel.</p>
          <p className="muted">{painel.mensagem}</p>
          <Button onClick={painel.tentarDeNovo}>Tentar de novo</Button>
        </div>
      )}

      {painel.estado === 'pronto' && (
        <>
          <section aria-label="Indicadores" className="grade-indicadores">
            <Indicador rotulo="Pedidos hoje" valor={String(painel.dados.pedidos.pedidosHoje)} nota={formatarDia(painel.dados.pedidos.dia)} />
            <Indicador rotulo="Faturamento do dia" valor={formatarMoeda(painel.dados.pedidos.faturamentoDoDia)} nota="Pedidos pagos criados hoje" />
            <Indicador
              rotulo="Aguardando pagamento"
              valor={String(painel.dados.pedidos.aguardandoPagamento)}
              nota="Expiram em 30 min"
              aviso={painel.dados.pedidos.aguardandoPagamento > 0}
            />
            <Indicador
              rotulo={`Estoque abaixo de ${painel.dados.estoque.limite}`}
              valor={String(painel.dados.estoque.estoqueBaixo)}
              nota="Produtos para repor"
              aviso={painel.dados.estoque.estoqueBaixo > 0}
              link={{ para: 'estoque', texto: 'Ver estoque' }}
            />
          </section>

          <section className="card ultimos" aria-labelledby="ultimos-titulo">
            <div className="ultimos-topo">
              <h2 id="ultimos-titulo" className="h3">
                Últimos pedidos
              </h2>
              <Link to="pedidos">Ver todos os pedidos</Link>
            </div>
            {painel.dados.ultimos.length === 0 ? (
              <p className="muted">Nenhum pedido ainda.</p>
            ) : (
              <div className="tabela-rolavel">
                <table className="tabela">
                  <caption className="sr">Os {ULTIMOS} pedidos mais recentes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Pedido</th>
                      <th scope="col">Data</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="num">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.dados.ultimos.map((pedido) => (
                      <tr key={pedido.id}>
                        <th scope="row">{numeroDoPedido(pedido.id)}</th>
                        <td>{formatarDataHora(pedido.criadoEm)}</td>
                        <td>
                          <Pill tom={TOM_STATUS[pedido.status]}>{ROTULO_STATUS[pedido.status]}</Pill>
                        </td>
                        <td className="num">{formatarMoeda(pedido.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

interface PropsIndicador {
  rotulo: string;
  valor: string;
  nota: string;
  /** Destaca o card (há algo a fazer). */
  aviso?: boolean;
  link?: { para: string; texto: string };
}

function Indicador({ rotulo, valor, nota, aviso = false, link }: PropsIndicador) {
  return (
    <div className={`card indicador${aviso ? ' indicador-aviso' : ''}`}>
      <span className="muted">{rotulo}</span>
      <span className="indicador-valor">{valor}</span>
      <span className="muted indicador-nota">{nota}</span>
      {link && <Link to={link.para}>{link.texto}</Link>}
    </div>
  );
}
