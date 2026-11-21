/**
 * 403 dentro do MFE: o shell já barra quem não tem o papel admin, mas quem protege de verdade é o backend. Se o
 * token perdeu o papel no meio da sessão (ou o shell foi contornado), a API responde 403 e a tela mostra isto
 * em vez de um erro genérico.
 */
export function Proibido() {
  return (
    <div className="card estado" role="alert">
      <span className="eyebrow">403</span>
      <h1 className="h2 admin-titulo" tabIndex={-1}>
        Acesso negado
      </h1>
      <p className="muted">Esta área é só para administradores. Entre com uma conta de administrador para continuar.</p>
    </div>
  );
}
