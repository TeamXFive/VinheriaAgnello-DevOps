const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');

function requisitar(url, { ca, token, method = 'GET', body, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      ca, method, headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let texto = '';
      res.setEncoding('utf8');
      res.on('data', (parte) => { texto += parte; });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, corpo: JSON.parse(texto) }); }
        catch { reject(new Error(`JSON inválido em ${url} (HTTP ${res.statusCode})`)); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error(`Tempo esgotado em ${url}`)), timeout);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function esperarSaude(url, ca, versao, servico, prazo = 60000) {
  const limite = Date.now() + prazo;
  let ultimoErro;
  do {
    try {
      const res = await requisitar(`${url}/health`, { ca, timeout: Math.min(5000, Math.max(1, limite - Date.now())) });
      assert.equal(res.status, 200);
      assert.equal(res.corpo.status, 'ok');
      assert.equal(res.corpo.servico, servico);
      if (versao !== undefined) assert.equal(res.corpo.versao, versao);
      return;
    } catch (erro) { ultimoErro = erro; }
    if (Date.now() < limite) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, limite - Date.now())));
  } while (Date.now() < limite);
  throw new Error(`Serviço ${servico} indisponível ou versão incorreta: ${ultimoErro.message}`);
}

async function testarApi({ pedidos, estoque, ca, tokenExpirado }) {
  await Promise.all([
    esperarSaude(pedidos, ca, undefined, 'pedidos'),
    esperarSaude(estoque, ca, undefined, 'estoque'),
  ]);
  let falhas = 0;
  let total = 0;
  async function caso(nome, executar) {
    total++;
    try { await executar(); console.log(`PASSOU: ${nome}`); }
    catch (erro) { falhas++; console.error(`FALHOU: ${nome}: ${erro.message}`); }
  }
  async function verificar(base, rota, status, campos, opcoes = {}) {
    const res = await requisitar(`${base}${rota}`, { ca, ...opcoes });
    assert.equal(res.status, status, `HTTP esperado ${status}, recebido ${res.status}`);
    for (const [campo, valor] of Object.entries(campos)) assert.deepEqual(res.corpo[campo], valor, campo);
    return res.corpo;
  }
  const erroToken = { erro: 'token ausente, inválido ou expirado' };
  await caso('pedido sem token (401)', () => verificar(pedidos, '/pedidos', 401, erroToken, { method: 'POST', body: { vinhoId: 1, quantidade: 2 } }));
  await caso('estoque sem token (401)', () => verificar(estoque, '/estoque/vinhos', 401, erroToken));
  await caso('senha incorreta (401)', () => verificar(pedidos, '/auth/login', 401, { erro: 'usuário ou senha inválidos' }, { method: 'POST', body: { usuario: 'vendas', senha: 'errada' } }));
  let token;
  await caso('login (200) e token válido', async () => {
    const login = await verificar(pedidos, '/auth/login', 200, { expiraEm: 900 }, { method: 'POST', body: { usuario: 'vendas', senha: 'Vinho@2026' } });
    assert.equal(typeof login.token, 'string');
    assert.equal(login.token.split('.').length, 3);
    token = login.token;
  });
  if (!token) throw new Error('Login falhou; os testes autenticados não podem continuar.');
  const pedido = (vinhoId, quantidade, auth = token) => ({ method: 'POST', token: auth, body: { vinhoId, quantidade } });
  await caso('pedido confirmado e baixa no estoque (201)', async () => {
    const antes = await verificar(estoque, '/estoque/vinhos/1', 200, { id: 1 }, { token });
    const criado = await verificar(pedidos, '/pedidos', 201, { status: 'CONFIRMADO', quantidade: 2, vendedor: 'vendas', vinho: antes.nome }, pedido(1, 2));
    assert.ok(Number.isInteger(criado.id) && criado.id > 0);
    await verificar(estoque, '/estoque/vinhos/1', 200, { quantidade: antes.quantidade - 2 }, { token });
    const lista = await verificar(pedidos, '/pedidos', 200, {}, { token });
    assert.ok(Array.isArray(lista) && lista.some((p) => p.id === criado.id));
  });
  await caso('vinho sem estoque (409)', () => verificar(pedidos, '/pedidos', 409, { erro: 'estoque insuficiente', disponivel: 0 }, pedido(3, 1)));
  for (const quantidade of [0, -1, 1.5, '2']) {
    await caso(`quantidade inválida ${JSON.stringify(quantidade)} (400)`, () => verificar(pedidos, '/pedidos', 400, { erro: 'quantidade deve ser um inteiro maior que zero' }, pedido(1, quantidade)));
  }
  await caso('vinho inexistente (404)', () => verificar(pedidos, '/pedidos', 404, { erro: 'vinho não encontrado' }, pedido(999, 1)));
  // Modifica os bytes assinados, sem depender de detalhes do padding base64url.
  const partes = token.split('.');
  partes[1] = Buffer.from(JSON.stringify({ sub: 'adulterado', exp: 9999999999 })).toString('base64url');
  for (const [nome, auth] of [['adulterado', partes.join('.')], ['expirado', tokenExpirado]]) {
    await caso(`token ${nome} rejeitado por ambos os serviços (401)`, async () => {
      assert.ok(auth, 'token de teste não informado');
      await verificar(pedidos, '/pedidos', 401, erroToken, { token: auth });
      await verificar(estoque, '/estoque/vinhos', 401, erroToken, { token: auth });
    });
  }
  console.log(`${total - falhas}/${total} cenários passaram.`);
  if (falhas) throw new Error(`${falhas} cenário(s) falharam.`);
}

module.exports = { requisitar, esperarSaude, testarApi };
if (require.main === module) {
  testarApi({
    pedidos: 'https://pedidos.vinheria.local:8443',
    estoque: 'https://estoque.vinheria.local:8443',
    ca: fs.readFileSync('/certs/ca.crt'),
    tokenExpirado: process.env.TOKEN_EXPIRADO,
  }).catch((erro) => { console.error(`FALHOU: ${erro.message}`); process.exitCode = 1; });
}
