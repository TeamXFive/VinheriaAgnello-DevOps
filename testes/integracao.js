// Executa os mesmos cenários em processos e dados descartáveis, sem Docker.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync, fork } = require('node:child_process');
const { testarApi, requisitar, esperarSaude } = require('./api');
const { gerarToken } = require('../servicos/comum/jwt');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'vinheria-testes-'));
const processos = [];
const segredo = crypto.randomBytes(32).toString('hex');
let logs = '';
let limpando = false;
function iniciar(nome, estoqueUrl) {
  return new Promise((resolve, reject) => {
    const filho = fork(path.join(__dirname, '..', 'servicos', nome, 'server.js'), [], {
      silent: true,
      env: {
        ...process.env, JWT_SECRET: segredo, BIND_HOST: '127.0.0.1',
        HTTP_PORT: '0', HTTPS_PORT: '0',
        TLS_CERT: path.join(pasta, 'servidor.crt'), TLS_KEY: path.join(pasta, 'servidor.key'),
        NODE_EXTRA_CA_CERTS: path.join(pasta, 'ca.crt'),
        ESTOQUE_URL: estoqueUrl || '',
      },
    });
    processos.push(filho);
    filho.stdout.on('data', (dados) => { logs += dados; });
    filho.stderr.on('data', (dados) => { logs += dados; });
    const timer = setTimeout(() => reject(new Error(`${nome} não iniciou em 15 segundos`)), 15000);
    filho.on('error', (erro) => { clearTimeout(timer); reject(erro); });
    filho.on('exit', (codigo, sinal) => {
      clearTimeout(timer);
      if (!limpando) {
        process.exitCode = 1;
        reject(new Error(`${nome} encerrou inesperadamente (${codigo ?? sinal})`));
      }
    });
    filho.on('message', (mensagem) => {
      if (mensagem.protocolo === 'https') {
        clearTimeout(timer);
        resolve(`https://127.0.0.1:${mensagem.porta}`);
      }
    });
  });
}
async function limpar() {
  limpando = true;
  await Promise.all(processos.map((filho) => new Promise((resolve) => {
    if (filho.exitCode !== null || filho.signalCode !== null) return resolve();
    const timer = setTimeout(() => filho.kill('SIGKILL'), 2000);
    filho.once('exit', () => { clearTimeout(timer); resolve(); });
    filho.kill('SIGTERM');
  })));
  fs.rmSync(pasta, { recursive: true, force: true });
}
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.once(sinal, () => { limpar().finally(() => process.exit(sinal === 'SIGINT' ? 130 : 143)); });
}
(async () => {
  try {
    const openssl = (...args) => execFileSync('openssl', args, { cwd: pasta, stdio: 'pipe' });
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=CA temporaria dos testes');
    openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'servidor.key', '-out', 'servidor.csr', '-subj', '/CN=localhost');
    fs.writeFileSync(path.join(pasta, 'servidor.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
    openssl('x509', '-req', '-days', '1', '-in', 'servidor.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'servidor.crt', '-extfile', 'servidor.ext');
    const estoque = await iniciar('estoque');
    const pedidos = await iniciar('pedidos', estoque);
    const ca = fs.readFileSync(path.join(pasta, 'ca.crt'));
    await assert.rejects(requisitar(`${estoque}/health`, { ca: [] }), (erro) =>
      ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(erro.code));
    console.log('PASSOU: HTTPS rejeita CA não confiável');
    await esperarSaude(estoque, ca, 'sem deploy do Jenkins', 'estoque');
    await assert.rejects(esperarSaude(estoque, ca, 'versão divergente', 'estoque', 100), /versão incorreta/);
    console.log('PASSOU: verificação aceita a versão esperada e rejeita divergência');
    await testarApi({ pedidos, estoque, ca, tokenExpirado: gerarToken({ sub: 'vendas' }, segredo, -60) });
  } catch (erro) {
    console.error(`FALHOU: ${erro.message}\n${logs}`);
    process.exitCode = 1;
  } finally { await limpar(); }
})();
