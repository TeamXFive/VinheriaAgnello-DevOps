const fs = require('node:fs');
const { esperarSaude } = require('../testes/api');
(async () => {
  const versao = fs.readFileSync('VERSAO_ESPERADA.txt', 'utf8').trim();
  if (!versao) throw new Error('Versão esperada vazia');
  const ca = fs.readFileSync('/certs/ca.crt');
  await Promise.all(['estoque', 'pedidos'].map(async (nome) => {
    await esperarSaude(`https://${nome}.vinheria.local:8443`, ca, versao, nome);
    console.log(`PASSOU: ${nome} disponível por HTTPS na versão ${versao}`);
  }));
})().catch((erro) => { console.error(`FALHOU: ${erro.message}`); process.exitCode = 1; });
