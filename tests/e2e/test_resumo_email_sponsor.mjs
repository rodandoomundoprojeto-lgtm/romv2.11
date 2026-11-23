import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  onRequestGet as patrocinadoresGet,
  filtrarCotasAtivas,
  resolverUrlCtaEmail
} from '../../functions/api/patrocinadores.js';
import { onRequestPost as newsletterSubscribePost } from '../../functions/api/newsletter-subscribe.js';
import workerDefault, {
  montarHtmlNewsletter,
  filtrarCotasAtivasWorker,
  coletarPatrocinadoresResumo,
  resolverUrlCtaWorker
} from '../../workers/resumo-diario/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const PATROCINADORES_JSON_PATH = path.join(ROOT_DIR, 'data', 'patrocinadores.json');

const PATROCINADORES_RAW = fs.readFileSync(PATROCINADORES_JSON_PATH, 'utf8');
const PATROCINADORES_DATA = JSON.parse(PATROCINADORES_RAW);

function createAssetsEnv(extra = {}) {
  return {
    ASSETS: {
      async fetch(req) {
        const u = new URL(typeof req === 'string' ? req : req.url);
        if (u.pathname === '/data/patrocinadores.json') {
          return new Response(PATROCINADORES_RAW, {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
        return new Response('Not Found', { status: 404 });
      }
    },
    ...extra
  };
}

const ORIGINAL_FETCH = globalThis.fetch;
after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('FEAT-EMAIL-PATROCINADOR-RESUMO', () => {
  test('1) GET /api/patrocinadores?media=logo&cota=resumo_dia&id=resumo_1795390482276_k9bla retorna PNG binário válido', async () => {
    const req = new Request(
      'https://www.rodandoomundo.com.br/api/patrocinadores?media=logo&cota=resumo_dia&id=resumo_1795390482276_k9bla',
      { method: 'GET' }
    );
    const resp = await patrocinadoresGet({ request: req, env: createAssetsEnv() });

    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'image/png');
    assert.match(resp.headers.get('Cache-Control') || '', /max-age=900/);

    const buf = new Uint8Array(await resp.arrayBuffer());
    assert.ok(buf.length > 8, 'PNG retornado deve possuir bytes válidos');
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
  });

  test('1b) GET /api/patrocinadores bloqueia SVG malicioso e faz redirect 302 para URL externa', async () => {
    const maliciousSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const customEnv = {
      ASSETS: {
        async fetch() {
          return new Response(
            JSON.stringify({
              ok: true,
              cotas: {
                resumo_dia: [
                  {
                    id: 'svg_xss',
                    ativo: true,
                    nome: 'XSS Test',
                    logo_url: `data:image/svg+xml;base64,${maliciousSvg}`
                  },
                  {
                    id: 'ext_logo',
                    ativo: true,
                    nome: 'Ext Test',
                    logo_url: 'https://cdn.exemplo.com/logo.png'
                  }
                ]
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    };

    const reqSvg = new Request('https://www.rodandoomundo.com.br/api/patrocinadores?media=logo&cota=resumo_dia&id=svg_xss');
    const respSvg = await patrocinadoresGet({ request: reqSvg, env: customEnv });
    assert.equal(respSvg.status, 403);

    const reqExt = new Request('https://www.rodandoomundo.com.br/api/patrocinadores?media=logo&cota=resumo_dia&id=ext_logo');
    const respExt = await patrocinadoresGet({ request: reqExt, env: customEnv });
    assert.equal(respExt.status, 302);
    assert.equal(respExt.headers.get('Location'), 'https://cdn.exemplo.com/logo.png');
  });

  test('2) filtrarCotasAtivas e filtrarCotasAtivasWorker validam status ativo, vigência de datas e múltiplos patrocinadores', () => {
    const hoje = '2026-11-23';
    const candidatos = [
      { id: 'inativo', ativo: false, nome: 'Marca Inativa', data_inicio: '2026-11-01', data_fim: '2026-12-31' },
      { id: 'futuro', ativo: true, nome: 'Marca Futura', data_inicio: '2026-11-24', data_fim: '2026-12-31' },
      { id: 'expirado', ativo: true, nome: 'Marca Expirada', data_inicio: '2026-11-01', data_fim: '2026-11-22' },
      { id: 'sem_marca', ativo: true, nome: '  ', logo_url: '', nome_imagem_url: '', data_inicio: '', data_fim: '' },
      { id: 'vigente_1', ativo: true, nome: 'S.U.I', data_inicio: '', data_fim: '' },
      { id: 'vigente_2', ativo: true, nome: 'Parceiro B', data_inicio: '2026-11-23', data_fim: '2026-11-23' }
    ];

    const ativosApi = filtrarCotasAtivas(candidatos, hoje);
    const ativosWorker = filtrarCotasAtivasWorker(candidatos, hoje);

    assert.deepEqual(ativosApi.map((i) => i.id), ['vigente_1', 'vigente_2']);
    assert.deepEqual(ativosWorker.map((i) => i.id), ['vigente_1', 'vigente_2']);

    // Objeto único também é normalizado
    assert.equal(filtrarCotasAtivas({ id: 'unico', ativo: true, nome: 'Unico' }, hoje).length, 1);
    assert.equal(filtrarCotasAtivasWorker({ id: 'unico', ativo: true, nome: 'Unico' }, hoje).length, 1);
  });

  test('2b) Prevenção de links quebrados (Regra 11 GEMINI.md) em resolverUrlCtaEmail e resolverUrlCtaWorker', () => {
    for (const resolver of [resolverUrlCtaEmail, resolverUrlCtaWorker]) {
      assert.equal(resolver(''), null);
      assert.equal(resolver('   '), null);
      assert.equal(resolver('javascript:alert(1)'), null);
      assert.equal(resolver('/rota-inexistente-404'), null);
      assert.equal(resolver('//evil.example/phish'), null);
      assert.equal(resolver('/resumo-do-dia'), 'https://www.rodandoomundo.com.br/resumo-do-dia');
      assert.equal(resolver('/parcerias'), 'https://www.rodandoomundo.com.br/parcerias');
      assert.equal(resolver('https://exemplo.com.br/promo'), 'https://exemplo.com.br/promo');
    }
  });

  test('3) montarHtmlNewsletter renderiza S.U.I sem CTA quando link_url="", com CTA quando URL válida e omite quando vazio', () => {
    const noticiasMock = [
      {
        relevancia: 1,
        categoria: 'Geopolítica & Global',
        corEditoria: '#388bfd',
        fonte: 'BBC News Brasil',
        pais: 'Global',
        codigoPais: 'BR',
        titulo: 'Destaque global de teste',
        url: 'https://www.bbc.com/portuguese/teste',
        resumo: 'Resumo editorial de teste para validação do template de e-mail.'
      }
    ];

    const suiSponsor = PATROCINADORES_DATA.cotas.resumo_dia[0];
    assert.equal(suiSponsor.nome, 'S.U.I');
    assert.equal(suiSponsor.link_url, '');

    // 3a) Com S.U.I ativo e link_url: ""
    const htmlSemCta = montarHtmlNewsletter(noticiasMock, '23 de novembro de 2026', {
      ativos: [suiSponsor],
      updatedAt: PATROCINADORES_DATA.atualizado_em
    });

    assert.ok(htmlSemCta.includes('OFERECIMENTO'));
    assert.ok(htmlSemCta.includes('S.U.I'));
    assert.ok(htmlSemCta.includes(suiSponsor.frase));
    assert.ok(
      htmlSemCta.includes('<img src="https://www.rodandoomundo.com.br/api/patrocinadores?media=logo&amp;cota=resumo_dia'),
      'Deve apontar para endpoint HTTP de mídia em vez de data URI'
    );
    assert.ok(!htmlSemCta.includes('data:image'), 'HTML do e-mail nunca deve conter data:image inline');
    assert.ok(!htmlSemCta.includes('<a href=""'), 'Nunca deve gerar <a href=""');
    assert.ok(!htmlSemCta.includes('Saiba mais'), 'Não deve renderizar botão CTA quando link_url é vazio');

    const idxCabecalho = htmlSemCta.indexOf('Resumo do Dia &bull; Edição de 23 de novembro de 2026');
    const idxOferecimento = htmlSemCta.indexOf('OFERECIMENTO');
    const idxCardNoticia = htmlSemCta.indexOf('Destaque global de teste');
    assert.ok(idxCabecalho !== -1 && idxOferecimento > idxCabecalho && idxCardNoticia > idxOferecimento);

    // 3b) Com link_url: "https://exemplo.com.br"
    const htmlComCta = montarHtmlNewsletter(noticiasMock, '23 de novembro de 2026', {
      ativos: [{ ...suiSponsor, link_url: 'https://exemplo.com.br' }],
      updatedAt: PATROCINADORES_DATA.atualizado_em
    });
    assert.ok(htmlComCta.includes('href="https://exemplo.com.br"'));
    assert.ok(htmlComCta.includes('Saiba mais'));

    // 3c) Sem patrocinadores ativos ([])
    const htmlSemPatrocinador = montarHtmlNewsletter(noticiasMock, '23 de novembro de 2026', []);
    assert.ok(!htmlSemPatrocinador.includes('OFERECIMENTO'));
  });

  test('3d) coletarPatrocinadoresResumo consulta endpoints na ordem do contrato e cai em fallback seguro', async () => {
    const chamadas = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      chamadas.push(u);
      if (u.includes('/api/patrocinadores')) {
        return new Response('Erro 502', { status: 502 });
      }
      if (u.includes('/v2/patrocinadores')) {
        return new Response(PATROCINADORES_RAW, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Unexpected', { status: 500 });
    };

    const info = await coletarPatrocinadoresResumo({});
    assert.equal(chamadas.length, 2);
    assert.ok(chamadas[0].startsWith('https://www.rodandoomundo.com.br/api/patrocinadores?_t='));
    assert.ok(chamadas[1].startsWith('https://www.rodandoomundo.com.br/v2/patrocinadores?_t='));
    assert.equal(info.ativos.length, 1);
    assert.equal(info.ativos[0].nome, 'S.U.I');

    // Fallback seguro quando todos falham
    globalThis.fetch = async () => {
      throw new Error('Network down');
    };
    const fallbackInfo = await coletarPatrocinadoresResumo({});
    assert.deepEqual(fallbackInfo, { ativos: [], updatedAt: '' });
  });

  test('4) POST /api/newsletter-subscribe envia boas-vindas ao Resend incluindo bloco OFERECIMENTO e S.U.I', async () => {
    const resendRequests = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.startsWith('https://api.resend.com/')) {
        resendRequests.push({
          url: u,
          method: init.method,
          body: init.body ? JSON.parse(init.body) : null
        });
        return new Response(JSON.stringify({ id: 'mock_resend_id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const req = new Request('https://www.rodandoomundo.com.br/api/newsletter-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'assinante@teste.com.br',
        nome: 'Carlos',
        topico: 'Resumo do dia'
      })
    });

    const resp = await newsletterSubscribePost({
      request: req,
      env: createAssetsEnv({
        RESEND_API_KEY: 're_test_mock_key_12345'
      })
    });

    assert.equal(resp.status, 200);
    const jsonResp = await resp.json();
    assert.equal(jsonResp.ok, true);
    assert.equal(jsonResp.resendStatusCode, 200);

    const emailCall = resendRequests.find((r) => r.url === 'https://api.resend.com/emails');
    assert.ok(emailCall, 'Deve ter disparado POST para https://api.resend.com/emails');
    assert.ok(emailCall.body && typeof emailCall.body.html === 'string');

    const sentHtml = emailCall.body.html;
    assert.ok(sentHtml.includes('OFERECIMENTO'), 'E-mail de boas-vindas deve incluir bloco OFERECIMENTO');
    assert.ok(sentHtml.includes('S.U.I'), 'E-mail de boas-vindas deve incluir patrocinador S.U.I');
    assert.ok(
      sentHtml.includes('https://www.rodandoomundo.com.br/api/patrocinadores?media=logo&amp;cota=resumo_dia'),
      'Logo no e-mail de boas-vindas deve usar URL pública /api/patrocinadores'
    );
    assert.ok(!sentHtml.includes('data:image'), 'E-mail de boas-vindas não deve conter data:image inline');
    assert.ok(!sentHtml.includes('<a href=""'), 'E-mail de boas-vindas não deve gerar <a href=""');

    const idxParagrafo = sentHtml.indexOf('Todos os dias pela manhã, você receberá nossa curadoria');
    const idxOferecimento = sentHtml.indexOf('OFERECIMENTO');
    const idxBotaoResumo = sentHtml.indexOf('Acessar o Resumo de Hoje');
    assert.ok(idxParagrafo !== -1 && idxOferecimento > idxParagrafo && idxBotaoResumo > idxOferecimento);
  });

  test('1c) GET /api/patrocinadores sem ?media mantém JSON padrão e headers no-store', async () => {
    const req = new Request('https://www.rodandoomundo.com.br/api/patrocinadores', { method: 'GET' });
    const resp = await patrocinadoresGet({ request: req, env: createAssetsEnv() });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(resp.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
    const body = await resp.json();
    assert.equal(body.ok, true);
    assert.equal(body.cotas.resumo_dia[0].nome, 'S.U.I');
  });

  test('3e) workerDefault.fetch (?teste=) coleta notícias + patrocinadores em paralelo e retorna patrocinadoresAtivos', async () => {
    let resendHtml = '';
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.startsWith('https://www.rodandoomundo.com.br/api/resumo')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [
              {
                relevancia: 1,
                categoria: 'Geopolítica & Global',
                fonte: 'BBC News Brasil',
                pais: 'Global',
                titulo: 'Manchete 1',
                url: 'https://www.bbc.com/1',
                resumo: 'Resumo 1'
              },
              {
                relevancia: 2,
                categoria: 'Brasil · Política & Congresso',
                fonte: 'g1 Política',
                pais: 'Brasil',
                titulo: 'Manchete 2',
                url: 'https://g1.globo.com/2',
                resumo: 'Resumo 2'
              },
              {
                relevancia: 3,
                categoria: 'Economia & Mercados',
                fonte: 'g1 Economia',
                pais: 'Brasil',
                titulo: 'Manchete 3',
                url: 'https://g1.globo.com/3',
                resumo: 'Resumo 3'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (u.startsWith('https://www.rodandoomundo.com.br/api/patrocinadores')) {
        return new Response(PATROCINADORES_RAW, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (u === 'https://api.resend.com/emails') {
        const body = JSON.parse(init.body);
        resendHtml = body.html;
        return new Response(JSON.stringify({ id: 'worker_test_email' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const req = new Request('https://worker.exemplo/?teste=qa@rodandoomundo.com.br');
    const resp = await workerDefault.fetch(req, { RESEND_API_KEY: 're_worker_mock_123' }, {});
    assert.equal(resp.status, 200);
    const json = await resp.json();
    assert.equal(json.ok, true);
    assert.equal(json.modo, 'teste');
    assert.deepEqual(json.patrocinadoresAtivos, ['S.U.I']);
    assert.ok(resendHtml.includes('OFERECIMENTO'));
    assert.ok(resendHtml.includes('S.U.I'));
    assert.ok(!resendHtml.includes('data:image'));
  });
});
