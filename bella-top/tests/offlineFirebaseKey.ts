/**
 * Testes offline: troca a credencial do Firebase por uma chave descartável gerada na hora.
 * O SDK inicializa sem rede e nenhum teste offline consegue alcançar o banco real,
 * mesmo que a máquina tenha GOOGLE_SERVICE_ACCOUNT_KEY configurada.
 */
import { generateKeyPairSync } from 'crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'bellatop-teste-offline',
  private_key: privateKey,
  client_email: 'teste-offline@bellatop-teste-offline.iam.gserviceaccount.com',
});
process.env.FIREBASE_PROJECT_ID = 'bellatop-teste-offline';
process.env.DRIVE_BRIDGE_URL = '';
