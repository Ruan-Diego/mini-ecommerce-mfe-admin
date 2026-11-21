import { Route, Routes } from 'react-router-dom';
import type { PropsRemoto } from '@ruan-diego/mini-event-contracts';
import { AdminProvider } from './contexto';
import { LayoutAdmin } from './pages/LayoutAdmin';
import { Painel } from './pages/Painel';
import { Produtos } from './pages/Produtos';
import { Estoque } from './pages/Estoque';
import { Pedidos } from './pages/Pedidos';
import './admin.css';

/**
 * Módulo exposto como ./App. O shell monta este componente numa rota com "/*",
 * então as rotas abaixo são relativas a props.basePath.
 */
export default function App({ getToken, eventBus }: PropsRemoto) {
  return (
    <AdminProvider getToken={getToken} eventBus={eventBus}>
      <Routes>
        <Route element={<LayoutAdmin />}>
          <Route index element={<Painel />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="pedidos" element={<Pedidos />} />
        </Route>
        <Route path="*" element={<p className="wrap muted">Página não encontrada neste microfrontend.</p>} />
      </Routes>
    </AdminProvider>
  );
}
