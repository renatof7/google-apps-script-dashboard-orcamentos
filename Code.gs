function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Dashboard Orçamentos')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ─── Utilitários ─────────────────────────────────────────────────────────────

function norm(t) {
  return t ? t.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() : '';
}

function toNum(v) {
  if (typeof v === 'number') return v;
  let s = v ? v.toString().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.') : '0';
  return parseFloat(s) || 0;
}

function mesKey(date) {
  if (!date || !(date instanceof Date)) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function mesLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return meses[parseInt(m) - 1] + '/' + y;
}

function fmtData(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return d + '/' + m + '/' + y;
}


// ─── Última edição POR PROJETO (via coluna timestamp) ─────────────────────────

function getUltimaEdicaoPorProjeto() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetDespesa = ss.getSheetByName('Despesa');
    const sheetReceita = ss.getSheetByName('Receita');

    const ultimasEdicoes = {};
    const colunaTimestamp = 6; // Coluna F

    if (sheetDespesa) {
      const dValues = sheetDespesa.getDataRange().getValues();
      for (let i = 1; i < dValues.length; i++) {
        const nomeProjeto = dValues[i][0];
        const dataTimestamp = dValues[i][colunaTimestamp - 1];
        if (!nomeProjeto) continue;
        const id = norm(nomeProjeto);
        if (dataTimestamp instanceof Date && !isNaN(dataTimestamp.getTime())) {
          if (!ultimasEdicoes[id] || dataTimestamp > ultimasEdicoes[id]) {
            ultimasEdicoes[id] = dataTimestamp;
          }
        }
      }
    }

    if (sheetReceita) {
      const rValues = sheetReceita.getDataRange().getValues();
      for (let j = 1; j < rValues.length; j++) {
        const nomeProjeto = rValues[j][0];
        const dataTimestamp = rValues[j][colunaTimestamp - 1];
        if (!nomeProjeto) continue;
        const id = norm(nomeProjeto);
        if (dataTimestamp instanceof Date && !isNaN(dataTimestamp.getTime())) {
          if (!ultimasEdicoes[id] || dataTimestamp > ultimasEdicoes[id]) {
            ultimasEdicoes[id] = dataTimestamp;
          }
        }
      }
    }

    return ultimasEdicoes;
  } catch (e) {
    return {};
  }
}


// ─── Total por Projeto ────────────────────────────────────────────────────────

function getTotalPorProjeto() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Total_por_projeto');
    if (!sheet) return {};
    const values = sheet.getDataRange().getValues();
    const totais = {};
    for (let i = 1; i < values.length; i++) {
      const nome = values[i][0];
      const valor = toNum(values[i][1]);
      if (nome) totais[norm(nome)] = valor;
    }
    return totais;
  } catch (e) {
    return {};
  }
}


// ─── Registra timestamp automático ao editar ──────────────────────────────────

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const nomeAba = sheet.getName();
  if (nomeAba !== 'Despesa' && nomeAba !== 'Receita') return;

  const linha = e.range.getRow();
  if (linha === 1) return;

  const colunaTimestamp = 6;
  sheet.getRange(linha, colunaTimestamp).setValue(new Date());
}


function getDadosProcessados() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetDespesa = ss.getSheetByName('Despesa');
    const sheetReceita = ss.getSheetByName('Receita');

    if (!sheetDespesa) return { erro: "Aba 'Despesa' não encontrada." };
    if (!sheetReceita) return { erro: "Aba 'Receita' não encontrada." };

    const dValues = sheetDespesa.getDataRange().getValues();
    const rValues = sheetReceita.getDataRange().getValues();
    const db = {};

    for (let i = 1; i < dValues.length; i++) {
      let nomeOriginal = dValues[i][0];
      if (!nomeOriginal) continue;
      let id = norm(nomeOriginal);
      if (!db[id]) db[id] = { nome: nomeOriginal, orcado: 0, realizado: 0, recebido: 0, _rubricas: {} };

      let valor = toNum(dValues[i][2]);
      let rubrica = dValues[i][3] ? dValues[i][3].toString().trim() : '';
      let status = norm(dValues[i][4]);

      if (status.includes('ORCADO')) db[id].orcado += valor;
      if (status.includes('REALIZADO')) db[id].realizado += valor;
      if (rubrica && status.includes('REALIZADO')) {
        db[id]._rubricas[rubrica] = (db[id]._rubricas[rubrica] || 0) + valor;
      }
    }

    for (let j = 1; j < rValues.length; j++) {
      let nomeProjR = rValues[j][0];
      let valorR = toNum(rValues[j][2]);
      let statusR = norm(rValues[j][4]);
      if (!nomeProjR) continue;
      if (!statusR.includes('REALIZADO')) continue;
      let idR = norm(nomeProjR);
      if (!db[idR]) db[idR] = { nome: nomeProjR, orcado: 0, realizado: 0, recebido: 0, _rubricas: {} };
      db[idR].recebido += valorR;
    }

    const totais = getTotalPorProjeto();
    const ultimasEdicoes = getUltimaEdicaoPorProjeto();

    const resultado = Object.values(db).map(p => {
      const id = norm(p.nome);
      const valorTotal = totais[id] || 0;
      const dataEdicao = ultimasEdicoes[id];

      p.valorTotal = valorTotal;
      p.saldo = valorTotal - p.recebido;
      p.topRubricas = Object.entries(p._rubricas)
        .sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([nome, valor]) => ({ nome, valor }));
      p.ultimaAtualizacao = dataEdicao ? fmtData(dataEdicao) : 'Nunca editado';
      delete p._rubricas;
      return p;
    });

    if (resultado.length === 0) return { erro: 'Nenhum dado encontrado nas abas.' };
    resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return resultado;
  } catch (e) {
    return { erro: e.message + ' | Stack: ' + e.stack };
  }
}


// ─── Detalhe do Projeto ───────────────────────────────────────────────────────

function getDetalheProjeto(nomeProjeto) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetDespesa = ss.getSheetByName('Despesa');
    const sheetReceita = ss.getSheetByName('Receita');
    if (!sheetDespesa) return { erro: "Aba 'Despesa' não encontrada." };

    const values = sheetDespesa.getDataRange().getValues();
    const idBuscado = norm(nomeProjeto);
    const mesesSet = {};
    const rubricasSet = {};
    const dados = {};

    for (let i = 1; i < values.length; i++) {
      const nome = values[i][0];
      const data = values[i][1];
      const valor = toNum(values[i][2]);
      const rubrica = values[i][3] ? values[i][3].toString().trim() : '';
      const status = norm(values[i][4]);

      if (norm(nome) !== idBuscado) continue;
      if (!rubrica) continue;

      const mk = mesKey(data);
      if (!mk) continue;

      mesesSet[mk] = true;
      rubricasSet[rubrica] = true;

      if (!dados[rubrica]) dados[rubrica] = {};
      if (!dados[rubrica][mk]) dados[rubrica][mk] = { orcado: 0, realizado: 0 };

      if (status.includes('ORCADO')) dados[rubrica][mk].orcado += valor;
      if (status.includes('REALIZADO')) dados[rubrica][mk].realizado += valor;
    }

    const RUBRICA_RECEBIMENTO = 'Recebimento';
    if (sheetReceita) {
      const rValues = sheetReceita.getDataRange().getValues();
      for (let j = 1; j < rValues.length; j++) {
        const nomeProjR = rValues[j][0];
        const dataR = rValues[j][1];
        const valorR = toNum(rValues[j][2]);
        const statusR = norm(rValues[j][4]);

        if (norm(nomeProjR) !== idBuscado) continue;

        const mk = mesKey(dataR);
        if (!mk) continue;

        mesesSet[mk] = true;
        rubricasSet[RUBRICA_RECEBIMENTO] = true;

        if (!dados[RUBRICA_RECEBIMENTO]) dados[RUBRICA_RECEBIMENTO] = {};
        if (!dados[RUBRICA_RECEBIMENTO][mk]) dados[RUBRICA_RECEBIMENTO][mk] = { orcado: 0, realizado: 0 };

        if (statusR.includes('ORCADO')) dados[RUBRICA_RECEBIMENTO][mk].orcado += valorR;
        if (statusR.includes('REALIZADO')) dados[RUBRICA_RECEBIMENTO][mk].realizado += valorR;
      }
    }

    const meses = Object.keys(mesesSet).sort();
    const mesesLabel = meses.map(mesLabel);

    const rubricas = Object.keys(rubricasSet)
      .filter(rub => {
        let somaOrcado = 0;
        let somaRealizado = 0;
        Object.keys(dados[rub] || {}).forEach(mk => {
          somaOrcado += (dados[rub][mk].orcado || 0);
          somaRealizado += (dados[rub][mk].realizado || 0);
        });
        return somaOrcado > 0 || somaRealizado > 0;
      })
      .sort((a, b) => {
        const ra = String(a).trim().toLowerCase();
        const rb = String(b).trim().toLowerCase();
        if (ra === 'gestão') return 1;
        if (rb === 'gestão') return -1;
        return ra.localeCompare(rb, 'pt-BR', { sensitivity: 'base' });
      });

    return {
      projeto: nomeProjeto,
      meses,
      mesesLabel,
      rubricas,
      dados
    };
  } catch (e) {
    return { erro: e.message };
  }
}


// ─── Salvar valor editado ─────────────────────────────────────────────────────

function salvarValor(nomeProjeto, rubrica, mk, tipo, novoValor) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const isReceita = norm(rubrica) === norm('Recebimento');
    const sheet = ss.getSheetByName(isReceita ? 'Receita' : 'Despesa');
    if (!sheet) return { ok: false, erro: `Aba '${isReceita ? 'Receita' : 'Despesa'}' não encontrada.` };

    const values = sheet.getDataRange().getValues();
    const idBuscado = norm(nomeProjeto);
    const statusAlvo = tipo === 'orcado' ? 'ORCADO' : 'REALIZADO';

    for (let i = 1; i < values.length; i++) {
      if (isReceita) {
        const nomeCell = values[i][0];
        const dataCell = values[i][1];
        const statusCell = norm(values[i][4]);

        if (norm(nomeCell) !== idBuscado) continue;
        if (mesKey(dataCell) !== mk) continue;
        if (!statusCell.includes(statusAlvo)) continue;

        sheet.getRange(i + 1, 3).setValue(novoValor);
        return { ok: true, linha: i + 1, aba: 'Receita' };
      } else {
        const nomeCell = values[i][0];
        const dataCell = values[i][1];
        const rubricaCell = values[i][3] ? values[i][3].toString().trim() : '';
        const statusCell = norm(values[i][4]);

        if (norm(nomeCell) !== idBuscado) continue;
        if (rubricaCell !== rubrica) continue;
        if (mesKey(dataCell) !== mk) continue;
        if (!statusCell.includes(statusAlvo)) continue;

        sheet.getRange(i + 1, 3).setValue(novoValor);
        return { ok: true, linha: i + 1, aba: 'Despesa' };
      }
    }

    return { ok: false, erro: 'Linha não encontrada para: ' + nomeProjeto + ' | ' + rubrica + ' | ' + mk + ' | ' + tipo };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
