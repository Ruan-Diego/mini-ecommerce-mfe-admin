/** Peças compartilhadas pelos testes Pact do mfe-admin (um arquivo de contrato por serviço). */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { MatchersV3, PactV3 } from '@pact-foundation/pact';

const { regex } = MatchersV3;

/** Pasta onde o Pact grava os contratos; `pnpm pact:copiar` leva ao backend (ADR-0005). */
export const pastaDosPacts = path.resolve(process.cwd(), 'pacts');

/** O Pact mescla com o arquivo que já existe: apagar antes garante que interação removida some do contrato. */
export function novoProvider(servico: string) {
  rmSync(path.join(pastaDosPacts, `mfe-admin-${servico}.json`), { force: true });
  return new PactV3({ consumer: 'mfe-admin', provider: servico, dir: pastaDosPacts, logLevel: 'warn' });
}

export const obterTokenAdmin = async () => 'token-pact-admin';
/** Um token sem o papel admin (o provider devolve 403 nas rotas /admin). */
export const obterTokenCliente = async () => 'token-pact-cliente';

export const CABECALHOS_ADMIN = { Accept: 'application/json', Authorization: 'Bearer token-pact-admin' };
export const CABECALHOS_ADMIN_JSON = { ...CABECALHOS_ADMIN, 'Content-Type': 'application/json' };
export const CABECALHOS_CLIENTE = { Accept: 'application/json', Authorization: 'Bearer token-pact-cliente' };

export const JSON_UTF8 = regex(/application\/json.*/.source, 'application/json');
export const instante = (exemplo: string) => regex(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/.source, exemplo);
