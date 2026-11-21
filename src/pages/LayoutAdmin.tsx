import { NavLink, Outlet } from 'react-router-dom';

/**
 * Rota de layout das telas do admin: navegação lateral (Painel, Produtos, Estoque, Pedidos) e a tela da vez no
 * <Outlet>. Por ser uma rota sem caminho próprio, os links relativos resolvem a partir do basePath do MFE (o shell
 * monta o admin em /admin). Quem barra quem não é admin é o shell (rota protegida) e, de verdade, o gateway.
 */
export function LayoutAdmin() {
  const classe = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);
  return (
    <section className="wrap admin">
      <nav aria-label="Administração" className="side admin-nav">
        <NavLink to="." end className={classe}>
          Painel
        </NavLink>
        <NavLink to="produtos" className={classe}>
          Produtos
        </NavLink>
        <NavLink to="estoque" className={classe}>
          Estoque
        </NavLink>
        <NavLink to="pedidos" className={classe}>
          Pedidos
        </NavLink>
      </nav>
      <div className="admin-conteudo">
        <Outlet />
      </div>
    </section>
  );
}
