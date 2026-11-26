const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { gerarToken, validarToken } = require('../servicos/comum/jwt');
const segredo = 'segredo-exclusivo-dos-testes';
function assinar(corpo, cabecalho = { alg: 'HS256', typ: 'JWT' }) {
  const dados = [cabecalho, corpo].map((valor) => Buffer.from(JSON.stringify(valor)).toString('base64url')).join('.');
  return `${dados}.${crypto.createHmac('sha256', segredo).update(dados).digest('base64url')}`;
}
test('aceita assinatura válida e preserva o usuário', () => {
  assert.equal(validarToken(gerarToken({ sub: 'vendas' }, segredo), segredo).sub, 'vendas');
});
test('rejeita assinatura de outro segredo e conteúdo adulterado', () => {
  const token = gerarToken({ sub: 'vendas' }, segredo);
  assert.equal(validarToken(token, 'outro-segredo'), null);
  const partes = token.split('.');
  partes[1] = Buffer.from(JSON.stringify({ sub: 'outro', exp: 9999999999 })).toString('base64url');
  assert.equal(validarToken(partes.join('.'), segredo), null);
});
test('rejeita tokens ausentes, malformados e algoritmo diferente', () => {
  for (const token of [undefined, '', 'abc', 'a.b.c', 'a.b.c.d']) assert.equal(validarToken(token, segredo), null);
  assert.equal(validarToken(assinar({ exp: 9999999999 }, { alg: 'none' }), segredo), null);
});
test('rejeita token expirado e o instante exato da expiração', () => {
  const original = Date.now;
  Date.now = () => 1800000000000;
  try {
    for (const validade of [-1, 0]) assert.equal(validarToken(gerarToken({ sub: 'vendas' }, segredo, validade), segredo), null);
    assert.ok(validarToken(gerarToken({ sub: 'vendas' }, segredo, 1), segredo));
  } finally { Date.now = original; }
});
test('exp precisa ser um número finito', () => {
  for (const exp of [undefined, null, '9999999999', 'Infinity', true, {}, [], 0]) {
    assert.equal(validarToken(assinar({ exp }), segredo), null);
  }
  // JSON.parse aceita o literal numérico 1e400, que produz Infinity.
  const dados = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"exp":1e400}').toString('base64url')}`;
  const token = `${dados}.${crypto.createHmac('sha256', segredo).update(dados).digest('base64url')}`;
  assert.equal(validarToken(token, segredo), null);
});
