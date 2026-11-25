// JWT assinado com HMAC-SHA256 (HS256), usando só o módulo crypto do Node.
const crypto = require('node:crypto');

const base64url = (texto) => Buffer.from(texto).toString('base64url');
const assinatura = (dados, segredo) => crypto.createHmac('sha256', segredo).update(dados).digest();

function gerarToken(payload, segredo, validadeSegundos = 900) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify({ ...payload, iat: agora, exp: agora + validadeSegundos }));
  return `${cabecalho}.${corpo}.${assinatura(`${cabecalho}.${corpo}`, segredo).toString('base64url')}`;
}

// Devolve os dados do token se a assinatura confere e ele não expirou; senão, null.
function validarToken(token, segredo) {
  const partes = (token || '').split('.');
  if (partes.length !== 3) return null;
  const [cabecalho, corpo, recebida] = partes;

  const esperada = assinatura(`${cabecalho}.${corpo}`, segredo);
  const assinaturaRecebida = Buffer.from(recebida, 'base64url');
  if (assinaturaRecebida.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(assinaturaRecebida, esperada)) return null;

  try {
    if (JSON.parse(Buffer.from(cabecalho, 'base64url')).alg !== 'HS256') return null;
    const dados = JSON.parse(Buffer.from(corpo, 'base64url'));
    if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) return null;
    return dados;
  } catch {
    return null;
  }
}

function tokenDoCabecalho(req) {
  const autorizacao = req.headers.authorization || '';
  return autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : null;
}

module.exports = { gerarToken, validarToken, tokenDoCabecalho };
