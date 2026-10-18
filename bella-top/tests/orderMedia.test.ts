/**
 * tests/orderMedia.test.ts
 * Suíte oficial de validação de mídia e controle de tamanho da OP.
 * AMBIENTE ISOLADO COM MOCKS - SEM GRAVAÇÃO REAL NO FIREBASE.
 */
import {
  sanitizeOrderMedia,
  assertFitsFirestoreDocument,
  FIRESTORE_DOC_SAFE_LIMIT_BYTES,
  isDataUrl,
  isBulkyMedia,
} from '../shared/orderMedia';
import { compressImageToDataUrl } from '../src/utils/imageCropper';

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
  console.log(`\n${colors.cyan}${colors.bold}=== TESTES DE CONTROLE DE MÍDIA E TAMANHO DE OP (900 KB) ===${colors.reset}\n`);

  // 1. Limite seguro por documento do Firestore (900 KB)
  console.log(`${colors.bold}1. Limite seguro por documento do Firestore (900 KB)${colors.reset}`);
  assert(FIRESTORE_DOC_SAFE_LIMIT_BYTES === 900 * 1024, 'Constante de limite fixada em 900 KB (921.600 bytes)');

  const compactDoc = {
    id: 'op_2502_1',
    opNumber: '2502.1',
    client: 'Bella Top Cliente',
    productName: 'Sacola Alça Fita 35x40',
    productThumbnail: 'data:image/jpeg;base64,' + 'A'.repeat(45 * 1024),
    layoutPreviewImage: 'data:image/jpeg;base64,' + 'B'.repeat(60 * 1024),
    targetQuantity: 5000,
    steps: [
      { id: 'step_1', processName: 'Refile', status: 'FINALIZADA', receivedQuantity: 5000, producedQuantity: 5000 },
      { id: 'step_2', processName: 'Corte e Solda', status: 'PRONTA', receivedQuantity: 5000, producedQuantity: 0 },
    ],
  };

  let compactFits = false;
  try {
    assertFitsFirestoreDocument(compactDoc, 'OP 2502.1');
    compactFits = true;
  } catch {
    compactFits = false;
  }
  assert(compactFits, 'Documento com layout/miniatura compactada (~110 KB) cabe com folga no Firestore (< 900 KB)');

  const oversizedDoc = {
    id: 'op_2502_oversized',
    opNumber: '2502.1',
    layoutImage: 'data:image/png;base64,' + 'Z'.repeat(1200 * 1024),
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
    'Mensagem de erro informa o limite de 900 KB e o número da OP de forma clara'
  );

  // 2. Sanitização sem Firebase Storage
  console.log(`\n${colors.bold}2. Sanitização de Mídia sem dependência do Firebase Storage${colors.reset}`);

  const sampleOp: any = {
    id: 'op_1001',
    opNumber: '1001',
    client: 'Cliente Teste',
    productThumbnail: 'data:image/jpeg;base64,' + 'T'.repeat(25 * 1024),
    layoutPreviewImage: 'data:image/jpeg;base64,' + 'L'.repeat(45 * 1024),
    layoutImages: [
      { id: 'img_thumb', urlOrBase64: 'data:image/jpeg;base64,' + 'T'.repeat(25 * 1024) },
      { id: 'img_pdf', urlOrBase64: 'X'.repeat(500 * 1024) }, // 500 KB PDF cru
    ],
    op_file: 'Y'.repeat(300 * 1024),
    opFileName: 'Ordem_1001.pdf',
    layout_file: 'Layout_1001.pdf',
  };

  const sanitizeResult = await sanitizeOrderMedia(sampleOp);
  const sanitized = sanitizeResult.order;

  assert(
    sanitized.productThumbnail === sampleOp.productThumbnail,
    'Preserva miniatura data URL compacta intacta no documento da OP'
  );
  assert(
    sanitized.layoutPreviewImage === sampleOp.layoutPreviewImage,
    'Preserva layoutPreviewImage compacto no documento da OP'
  );
  assert(
    sanitized.layoutImages[1].urlOrBase64 !== 'X'.repeat(500 * 1024),
    'Higieniza anexo binário bruto gigante (> 200 KB) em layoutImages'
  );
  assert(
    sanitized.op_file === 'Ordem_1001.pdf',
    'Converte op_file de base64 bruto gigante de volta para o nome do arquivo'
  );

  // 3. Utilitários de detecção e compressão
  console.log(`\n${colors.bold}3. Utilitários de Detecção e Compressão${colors.reset}`);
  assert(isDataUrl('data:image/png;base64,123'), 'isDataUrl reconhece prefixo data:');
  assert(!isDataUrl('http://storage/foto.jpg'), 'isDataUrl rejeita URLs HTTP');
  assert(isBulkyMedia('A'.repeat(250 * 1024)), 'isBulkyMedia detecta mídia pesada (> 200 KB)');
  assert(!isBulkyMedia('data:image/jpeg;base64,compacta'), 'isBulkyMedia aceita miniatura data URL leve');

  const svgSample = 'data:image/svg+xml;utf8,<svg><rect/></svg>';
  const svgResult = await compressImageToDataUrl(svgSample);
  assert(svgResult === svgSample, 'compressImageToDataUrl preserva SVGs leves diretamente');

  const externalUrl = 'https://exemplo.com/fotos/sacola.jpg';
  const urlResult = await compressImageToDataUrl(externalUrl);
  assert(urlResult === externalUrl, 'compressImageToDataUrl preserva URLs externas sem recompressão');

  // 4. Integridade de OPs existentes
  console.log(`\n${colors.bold}4. Integridade de OPs Existentes${colors.reset}`);
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
  };

  const existingRes = await sanitizeOrderMedia(existingOp);
  assert(existingRes.order.id === existingOp.id, 'OP existente preserva seu ID original');
  assert(existingRes.order.opNumber === '15487', 'OP existente preserva número original');
  assert(existingRes.order.steps.length === 2, 'Etapas existentes da OP permanecem 100% intactas');

  console.log(`\n${colors.bold}=== RESULTADO DA SUÍTE DE TESTES DE MÍDIA ===${colors.reset}`);
  console.log(`Total executados: ${passed + failed}`);
  console.log(`Aprovados: ${colors.green}${passed}${colors.reset}`);
  console.log(`Falhas: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runMediaTests().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
