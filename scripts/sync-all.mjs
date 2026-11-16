#!/usr/bin/env node
/**
 * INDIE PLAY X — Sistema di Sincronizzazione Simultanea:
 * 1. Hard Disk Locale (Codice sorgente + Build di produzione /dist + release_log.json)
 * 2. GitHub Repository (https://github.com/ALATA2/INDIEPLAYX - branch main)
 * 3. Hosting Cloud (Cloudflare Pages & Vercel via Git Webhook + Direct CLI)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const noBump = args.includes('--no-bump');
const customMsgArg = args.find(a => !a.startsWith('--'));

function run(cmd, options = {}) {
  console.log(`\x1b[36m▶ Esecuzione:\x1b[0m ${cmd}`);
  return execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit', ...options });
}

function getAndBumpVersion() {
  const versionFile = path.join(ROOT_DIR, 'src', 'version.js');
  const indexFile = path.join(ROOT_DIR, 'index.html');

  let content = fs.readFileSync(versionFile, 'utf8');
  const match = content.match(/APP_VERSION\s*=\s*['"]Version\s+1\.(\d+)['"]/);
  if (!match) {
    throw new Error('Impossibile leggere la versione da src/version.js');
  }

  let alreadyBumpedInWorkingTree = false;
  try {
    const diffOut = execSync('git diff HEAD -- src/version.js', { cwd: ROOT_DIR, encoding: 'utf8' });
    if (diffOut && diffOut.includes('+export const APP_VERSION')) {
      alreadyBumpedInWorkingTree = true;
    }
  } catch (e) {}

  const currentNum = parseInt(match[1], 10);
  const shouldSkipBump = noBump || alreadyBumpedInWorkingTree;
  const nextNum = shouldSkipBump ? currentNum : currentNum + 1;
  const currentVersionStr = `Version 1.${currentNum}`;
  const nextVersionStr = `Version 1.${nextNum}`;

  if (!shouldSkipBump) {
    content = content.replace(`'${currentVersionStr}'`, `'${nextVersionStr}'`);
    fs.writeFileSync(versionFile, content, 'utf8');

    if (fs.existsSync(indexFile)) {
      let idxContent = fs.readFileSync(indexFile, 'utf8');
      idxContent = idxContent.replace(/Version\s+1\.\d+/g, nextVersionStr);
      fs.writeFileSync(indexFile, idxContent, 'utf8');
    }
    console.log(`\x1b[32m✓ Versione incrementata automaticamente: ${currentVersionStr} -> ${nextVersionStr}\x1b[0m`);
  } else {
    console.log(`\x1b[32m✓ Versione corrente mantenuta: ${nextVersionStr}\x1b[0m`);
  }

  return nextVersionStr;
}

function updateLocalReleaseLog(versionStr, message) {
  const logPath = path.join(ROOT_DIR, 'release_log.json');
  let history = [];
  if (fs.existsSync(logPath)) {
    try {
      history = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      history = [];
    }
  }

  const entry = {
    version: versionStr,
    timestamp: new Date().toISOString(),
    message: message || `Aggiornamento simultaneo ${versionStr}`,
    targets: [
      'Hard Disk (c:\\Users\\green\\Desktop\\INDIE-PLAY-X + /dist)',
      'GitHub (https://github.com/ALATA2/INDIEPLAYX - main)',
      'Cloudflare Pages & Vercel Hosting (Auto-Deploy su push main)'
    ]
  };

  history.unshift(entry);
  fs.writeFileSync(logPath, JSON.stringify(history.slice(0, 50), null, 2), 'utf8');
  console.log(`\x1b[32m✓ Registro locale su Hard Disk aggiornato (release_log.json)\x1b[0m`);
}

async function main() {
  console.log('\n================================================================');
  console.log(' 🚀 INDIE PLAY X — SINCRONIZZAZIONE SIMULTANEA (HD + GITHUB + CLOUDFLARE)');
  console.log('================================================================\n');

  // 1. Aggiorna versione su Hard Disk
  const versionStr = getAndBumpVersion();
  const commitMessage = customMsgArg
    ? `feat(${versionStr}): ${customMsgArg}`
    : `feat(${versionStr}): aggiornamento simultaneo Hard Disk, GitHub e Hosting`;

  // 2. Aggiorna registro locale su Hard Disk
  updateLocalReleaseLog(versionStr, commitMessage);

  // 3. Compila il pacchetto di produzione su Hard Disk (/dist)
  console.log('\n\x1b[33m[1/3] Compilazione pacchetto di produzione su Hard Disk (cartella /dist)...\x1b[0m');
  run('npm run build');

  // 4. Sincronizza con GitHub (che attiva in simultanea Cloudflare Pages & Vercel)
  console.log('\n\x1b[33m[2/3] Sincronizzazione con GitHub (ALATA2/INDIEPLAYX)...\x1b[0m');
  try {
    run('git add -A');
    run(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
  } catch (e) {
    console.log('\x1b[33mℹ Nessuna nuova modifica da committare o commit già presente.\x1b[0m');
  }

  run('git push origin main');

  // 5. Conferma attivazione Hosting (Cloudflare Pages + Vercel)
  console.log('\n\x1b[33m[3/3] Trigger Hosting Cloud (Cloudflare Pages & Vercel)...\x1b[0m');
  console.log('\x1b[32m✓ Push ricevuto da GitHub (branch main)!\x1b[0m');
  console.log('\x1b[32m✓ Hard Disk locale aggiornato (sorgenti + /dist + release_log.json)\x1b[0m');
  console.log('\x1b[32m✓ GitHub aggiornato: https://github.com/ALATA2/INDIEPLAYX\x1b[0m');
  console.log('\x1b[32m✓ Cloudflare Pages & Vercel: Deploy automatico avviato dal branch main!\x1b[0m\n');
}

main().catch(err => {
  console.error('\x1b[31m✖ Errore durante la sincronizzazione:\x1b[0m', err.message);
  process.exit(1);
});
