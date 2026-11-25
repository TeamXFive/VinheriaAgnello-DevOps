// Servidor HTTP (porta 8080) e HTTPS (porta 8443) com respostas em JSON.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

function responder(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

function lerJson(req) {
  return new Promise((resolve, reject) => {
    let texto = '';
    req.on('data', (parte) => {
      texto += parte;
      if (texto.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(texto ? JSON.parse(texto) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

// Versão publicada pelo Jenkins (arquivo VERSAO.txt gravado no deploy).
function versaoPublicada(pastaDoServico) {
  try {
    return fs.readFileSync(path.join(pastaDoServico, 'VERSAO.txt'), 'utf8').trim();
  } catch {
    return 'sem deploy do Jenkins';
  }
}

function iniciarServidor(nome, rotas) {
  const tratar = async (req, res) => {
    res.on('finish', () => console.log(`[${nome}] ${req.method} ${req.url} -> ${res.statusCode}`));
    try {
      await rotas(req, res);
    } catch (erro) {
      if (erro.message === 'JSON inválido') return responder(res, 400, { erro: erro.message });
      console.error(erro);
      responder(res, 500, { erro: 'erro interno' });
    }
  };

  http.createServer(tratar).listen(8080, () => console.log(`[${nome}] HTTP na porta 8080`));

  if (process.env.TLS_CERT && process.env.TLS_KEY) {
    const certificado = { cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) };
    https.createServer(certificado, tratar).listen(8443, () => console.log(`[${nome}] HTTPS na porta 8443`));
  }
}

module.exports = { responder, lerJson, versaoPublicada, iniciarServidor };
