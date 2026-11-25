// Microsserviço de Estoque: disponibilidade e reserva de vinhos.
const { iniciarServidor, responder, lerJson, versaoPublicada } = require('../comum/http');
const { validarToken, tokenDoCabecalho } = require('../comum/jwt');

const SEGREDO = process.env.JWT_SECRET;

const vinhos = new Map([
  [1, { id: 1, nome: 'Agnello Reserva Tinto 2021', uva: 'Cabernet Sauvignon', quantidade: 24 }],
  [2, { id: 2, nome: 'Agnello Branco Seco 2023', uva: 'Chardonnay', quantidade: 12 }],
  [3, { id: 3, nome: 'Agnello Rosé 2024', uva: 'Merlot', quantidade: 0 }],
]);

iniciarServidor('estoque', async (req, res) => {
  const { pathname } = new URL(req.url, 'http://estoque');

  if (req.method === 'GET' && pathname === '/health') {
    return responder(res, 200, { servico: 'estoque', status: 'ok', versao: versaoPublicada(__dirname) });
  }

  // Todas as outras rotas exigem um JWT válido.
  const usuario = validarToken(tokenDoCabecalho(req), SEGREDO);
  if (!usuario) return responder(res, 401, { erro: 'token ausente, inválido ou expirado' });

  const rota = pathname.match(/^\/estoque\/vinhos(?:\/(\d+))?(\/reserva)?$/);
  if (!rota) return responder(res, 404, { erro: 'rota não encontrada' });

  if (req.method === 'GET' && !rota[1]) return responder(res, 200, [...vinhos.values()]);

  const vinho = vinhos.get(Number(rota[1]));
  if (!vinho) return responder(res, 404, { erro: 'vinho não encontrado' });

  if (req.method === 'GET' && !rota[2]) return responder(res, 200, vinho);

  if (req.method === 'POST' && rota[2]) {
    if (usuario.perfil !== 'vendas') return responder(res, 403, { erro: 'perfil sem permissão para reservar' });

    const { quantidade } = await lerJson(req);
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      return responder(res, 400, { erro: 'quantidade deve ser um inteiro maior que zero' });
    }
    if (vinho.quantidade < quantidade) {
      return responder(res, 409, { erro: 'estoque insuficiente', disponivel: vinho.quantidade });
    }

    vinho.quantidade -= quantidade;
    return responder(res, 200, { vinhoId: vinho.id, reservado: quantidade, restante: vinho.quantidade });
  }

  return responder(res, 405, { erro: 'método não permitido' });
});
