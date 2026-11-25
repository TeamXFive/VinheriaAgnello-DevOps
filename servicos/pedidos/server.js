// Microsserviço de Pedidos: login (emite o JWT) e criação de pedidos.
// Para confirmar um pedido, consulta e reserva o vinho no Estoque via REST, repassando o token.
const crypto = require('node:crypto');
const { iniciarServidor, responder, lerJson, versaoPublicada } = require('../comum/http');
const { gerarToken, validarToken, tokenDoCabecalho } = require('../comum/jwt');

const SEGREDO = process.env.JWT_SECRET;
const ESTOQUE_URL = process.env.ESTOQUE_URL || 'https://estoque.vinheria.local:8443';

// Usuários de teste. A senha é guardada como hash scrypt (sal + hash), nunca em texto puro.
const usuarios = {
  vendas: {
    perfil: 'vendas',
    sal: '08a59e805bf38ec0cf6f17c1a3088a76',
    hash: '02132dbc94d8a8d5d5f560162b2ea92bd135c4ff0d941e2127f9529bebf81d71',
  },
  consulta: {
    perfil: 'consulta',
    sal: '1dd4d80f0b9dd7e17fb64d6c771aef7e',
    hash: 'efc06c2bd26e54ff6a8d4bce80a013ddf029286c47faf5f234f5d4258bae91c1',
  },
};

function senhaConfere(usuario, senha) {
  if (!usuario || typeof senha !== 'string') return false;
  const calculado = crypto.scryptSync(senha, usuario.sal, 32);
  return crypto.timingSafeEqual(calculado, Buffer.from(usuario.hash, 'hex'));
}

async function chamarEstoque(caminho, token, opcoes = {}) {
  const resposta = await fetch(`${ESTOQUE_URL}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

const pedidos = [];

iniciarServidor('pedidos', async (req, res) => {
  const { pathname } = new URL(req.url, 'http://pedidos');

  if (req.method === 'GET' && pathname === '/health') {
    return responder(res, 200, { servico: 'pedidos', status: 'ok', versao: versaoPublicada(__dirname), estoque: ESTOQUE_URL });
  }

  if (req.method === 'POST' && pathname === '/auth/login') {
    const { usuario, senha } = await lerJson(req);
    const cadastro = usuarios[usuario];
    if (!senhaConfere(cadastro, senha)) return responder(res, 401, { erro: 'usuário ou senha inválidos' });
    return responder(res, 200, { token: gerarToken({ sub: usuario, perfil: cadastro.perfil }, SEGREDO), expiraEm: 900 });
  }

  const token = tokenDoCabecalho(req);
  const usuario = validarToken(token, SEGREDO);
  if (!usuario) return responder(res, 401, { erro: 'token ausente, inválido ou expirado' });

  if (req.method === 'GET' && pathname === '/pedidos') return responder(res, 200, pedidos);

  if (req.method === 'POST' && pathname === '/pedidos') {
    const { vinhoId, quantidade } = await lerJson(req);

    const consulta = await chamarEstoque(`/estoque/vinhos/${vinhoId}`, token);
    if (consulta.status !== 200) return responder(res, consulta.status, consulta.corpo);

    const reserva = await chamarEstoque(`/estoque/vinhos/${vinhoId}/reserva`, token, {
      method: 'POST',
      body: JSON.stringify({ quantidade }),
    });
    if (reserva.status !== 200) return responder(res, reserva.status, reserva.corpo);

    const pedido = {
      id: pedidos.length + 1,
      vinho: consulta.corpo.nome,
      quantidade,
      vendedor: usuario.sub,
      status: 'CONFIRMADO',
      criadoEm: new Date().toISOString(),
    };
    pedidos.push(pedido);
    return responder(res, 201, pedido);
  }

  return responder(res, 404, { erro: 'rota não encontrada' });
});
