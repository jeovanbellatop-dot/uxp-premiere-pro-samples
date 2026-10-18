/**
 * Suíte de Testes de Mídia e Controle de Tamanho de OP - Bella Top MES
 * Validação rigorosa do fluxo de fotos, compressão e limite de 900 KB do Firestore.
 * AMBIENTE ISOLADO COM MOCKS - SEM GRAVAÇÃO REAL NO FIREBASE.
 */
import { sanitizeOrderMedia, assertFitsFirestoreDocument } from '../server/utils/opMedia';
import { compressImageToDataUrl } from '../src/utils/imageCropper';
import type { ProductionOrder } from '../src/types/mes';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    passed++;
  } else {
    console.error(`  ${colors.red}✗${colors.reset} ${colors.bold}${testName}${colors.reset}`);
    if (detail) console.error(`    ${colors.yellow}Detalhe: ${detail}${colors.reset}`);
    failed++;
  }
}

async function runMediaTests() {
  console.log(`\n${colors.cyan}${colors.bold}=== INICIANDO SUÍTE DE TESTES DE MÍDIA (ISOLAMENTO COMPLETO) ===${colors.reset}\n`);

  // =========================================================================
  // CENÁRIO 1: Validação de Limite de 900 KB do Firestore (assertFitsFirestoreDocument)
  // =========================================================================
  console.log(`${colors.bold}1. Limite seguro por documento do Firestore (900 KB)${colors.reset}`);

  const compactDoc = {
    id: 'op_teste_compacta',
    opNumber: '2502.1',
    client: 'Cliente Exemplo',
    productName: 'Sacola Alça Fita 35x40',
    productThumbnail: 'data:image/jpeg;base64,' + 'A'.repeat(50 * 1024), // ~50 KB
    layoutPreviewImage: 'data:image/jpeg;base64,' + 'B'.repeat(60 * 1024), // ~60 KB
    targetQuantity: 5000,
  };

  let compactFits = false;
  try {
    assertFitsFirestoreDocument(compactDoc, 'OP 2502.1');
    compactFits = true;
  } catch (err: any) {
    compactFits = false;
  }
  assert(compactFits, 'Documento com imagem compactada (~110 KB) cabe com folga no Firestore (< 900 KB)');

  const oversizedDoc = {
    id: 'op_teste_pesada',
    opNumber: '2502.1',
    client: 'Cliente Exemplo',
    productName: 'Sacola Pesada',
    layoutImage: 'data:image/png;base64,' + 'Z'.repeat(1200 * 1024), // ~1.2 MB
  };

  let rejectedOver900Kb = false;
  let rejectedErrorMsg = '';
  try {
    assertFitsFirestoreDocument(oversizedDoc, 'A Ordem de Produção 2502.1');
  } catch (err: any) {
    rejectedOver900Kb = true;
    rejectedErrorMsg = err?.message || '';
  }
  assert(rejectedOver900Kb, 'Documento acima de 900 KB é rejeitado explicitamente');
  assert(
    rejectedErrorMsg.includes('900 KB') && rejectedErrorMsg.includes('2502.1'),
    'Mensagem de erro informa o limite de 900 KB e a OP afetada de forma clara',
    `Mensagem: ${rejectedErrorMsg}`
  );

  // =========================================================================
  // CENÁRIO 2: Higienização de Mídia (sanitizeOrderMedia) sem Firebase Storage
  // =========================================================================
  console.log(`\n${colors.bold}2. Sanitização de Mídia sem dependência do Firebase Storage${colors.reset}`);

  const sampleOpWithMedia: any = {
    id: 'op_1001',
    opNumber: '1001',
    client: 'Loja Teste',
    productThumbnail: 'data:image/jpeg;base64,' + 'T'.repeat(25 * 1024),
    layoutPreviewImage: 'data:image/jpeg;base64,' + 'L'.repeat(45 * 1024),
    layoutImages: [
      { id: 'img_thumb', urlOrBase64: 'data:image/jpeg;base64,' + 'T'.repeat(25 * 1024) },
      { id: 'img_huge_pdf', urlOrBase64: 'B'.repeat(500 * 1024) }, // 500 KB raw PDF
    ],
    op_file: 'B'.repeat(300 * 1024), // 300 KB raw blob em vez de nome de arquivo
    opFileName: 'Ordem_1001.pdf',
    layout_file: 'Layout_1001.pdf',
  };

  const sanitizeResult = await sanitizeOrderMedia(sampleOpWithMedia);
  const sanitized = sanitizeResult.order;

  assert(
    sanitized.productThumbnail === sampleOpWithMedia.productThumbnail,
    'Preserva miniatura data URL compacta intacta no documento da OP'
  );
  assert(
    sanitized.layoutPreviewImage === sampleOpWithMedia.layoutPreviewImage,
    'Preserva layoutPreviewImage compacto no documento da OP'
  );
  assert(
    sanitized.layoutImages[1].urlOrBase64 !== 'B'.repeat(500 * 1024),
    'Higieniza anexo binário bruto gigante (> 200 KB) em layoutImages'
  );
  assert(
    sanitized.op_file === 'Ordem_1001.pdf',
    'Converte op_file de base64 bruto gigante de volta para o nome do arquivo'
  );

  // =========================================================================
  // CENÁRIO 3: Função de compressão de imagem (compressImageToDataUrl)
  // =========================================================================
  console.log(`\n${colors.bold}3. Utilitário de Compressão no Navegador (compressImageToDataUrl)${colors.reset}`);

  const svgSample = 'data:image/svg+xml;utf8,<svg><rect/></svg>';
  const svgResult = await compressImageToDataUrl(svgSample);
  assert(svgResult === svgSample, 'compressImageToDataUrl preserva SVGs leves diretamente');

  const externalUrl = 'https://exemplo.com/fotos/sacola.jpg';
  const urlResult = await compressImageToDataUrl(externalUrl);
  assert(urlResult === externalUrl, 'compressImageToDataUrl preserva URLs HTTP/HTTPS externas sem recompressão desnecessária');

  const emptyResult = await compressImageToDataUrl('');
  assert(emptyResult === '', 'compressImageToDataUrl lida com string vazia de forma segura');

  // =========================================================================
  // CENÁRIO 4: Preservação de dados e compatibilidade com OPs existentes
  // =========================================================================
  console.log(`\n${colors.bold}4. Compatibilidade e Integridade de OPs Existentes${colors.reset}`);

  const existingOp: any = {
    id: 'op_existente_antiga',
    opNumber: '15487',
    client: 'Cliente Antigo Cadastrado',
    productName: 'Sacola Alça Vazada',
    targetQuantity: 10000,
    steps: [
      { id: 'step_1', processName: 'Refile', status: 'FINALIZADA', producedQuantity: 10000, lossQuantity: 0, goodQuantity: 10000 },
      { id: 'step_2', processName: 'Corte e Solda', status: 'PRODUZINDO', receivedQuantity: 10000, producedQuantity: 0, lossQuantity: 0, goodQuantity: 0 },
    ],
    productThumbnail: 'data:image/jpeg;base64,compacta',
  };

  const existingSanitize = await sanitizeOrderMedia(existingOp);
  assert(existingSanitize.order.id === existingOp.id, 'OP existente preserva seu ID original');
  assert(existingSanitize.order.opNumber === '15487', 'OP existente preserva número original');
  assert(existingSanitize.order.steps.length === 2, 'Etapas existentes da OP permanecem 100% intactas');
  assert(existingSanitize.order.client === existingOp.client, 'Dados de cliente e produto permanecem inalterados');

  // =========================================================================
  // RESUMO DOS TESTES DE MÍDIA
  // =========================================================================
  console.log(`\n${colors.bold}=== RESULTADO DA SUÍTE DE TESTES DE MÍDIA ===${colors.reset}`);
  console.log(`Total executados: ${passed + failed}`);
  console.log(`Aprovados: ${colors.green}${passed}${colors.reset}`);
  console.log(`Falhas: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runMediaTests().catch((err) => {
  console.error('Erro fatal na suíte de testes de mídia:', err);
  process.exit(1);
});
