#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = __dirname;
const OWNER = process.env.GITHUB_OWNER || 'Futuret3chdev';
const REPO = process.env.GITHUB_REPO || 'starfeet';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const MESSAGE = process.argv[2] || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const SKIP_GITHUB = process.env.SYNC_GITHUB === '0';
const USE_VERCEL_CLI = process.env.SYNC_VERCEL === 'cli';

const SKIP = new Set(['.git', '.vercel', '.tools', 'node_modules', '.DS_Store']);
const SKIP_EXT = /\.(log)$/;
const BINARY_EXT = /\.(png|jpg|jpeg|gif|ico|webp|glb|mp4)$/i;

function getGhToken() {
  const ghPaths = [
    path.join(ROOT, '../soccer-pro/.tools/gh'),
    path.join(ROOT, '.tools/gh'),
    'gh'
  ];
  for (const gh of ghPaths) {
    try {
      return execSync(`"${gh}" auth token`, { encoding: 'utf8' }).trim();
    } catch (_) {}
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  throw new Error('GitHub not authenticated. Run: gh auth login');
}

function api(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'starfeet-sync',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function walk(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(path.join(dir, entry.name), rel));
    else if (!SKIP_EXT.test(entry.name)) files.push(rel);
  }
  return files;
}

function blobPayload(filePath) {
  const full = path.join(ROOT, filePath);
  const buf = fs.readFileSync(full);
  if (BINARY_EXT.test(filePath)) {
    return { content: buf.toString('base64'), encoding: 'base64' };
  }
  return { content: buf.toString('utf8'), encoding: 'utf-8' };
}

async function createBlob(token, filePath) {
  const res = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/blobs`, blobPayload(filePath));
  if (res.status !== 201) throw new Error(`Blob failed for ${filePath}: ${res.status}`);
  return res.data.sha;
}

async function syncGitHubAtomic(token) {
  const files = walk(ROOT).sort();
  console.log(`\n📦 GitHub: syncing ${files.length} files → ONE commit on ${OWNER}/${REPO}...`);
  const treeItems = [];
  for (const filePath of files) {
    const sha = await createBlob(token, filePath);
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha });
    process.stdout.write(`  ✓ ${filePath}\n`);
  }
  const treeRes = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
  if (treeRes.status !== 201) throw new Error(`Tree failed: ${treeRes.status}`);
  const refRes = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const parents = refRes.status === 200 ? [refRes.data.object.sha] : [];
  const commitRes = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: MESSAGE, tree: treeRes.data.sha, parents
  });
  if (commitRes.status !== 201) throw new Error(`Commit failed: ${commitRes.status}`);
  const commitSha = commitRes.data.sha;
  if (refRes.status === 200) {
    await api(token, 'PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commitSha });
  } else {
    await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commitSha });
  }
  console.log(`✅ GitHub: 1 commit pushed (${commitSha.slice(0, 7)})`);
  console.log(`   https://github.com/${OWNER}/${REPO}`);
}

function syncVercelCli() {
  const nodeBin = process.env.NODE_BIN || '/tmp/node-v22.16.0-darwin-x64/bin';
  const env = { ...process.env, PATH: `${nodeBin}:${process.env.PATH || ''}` };
  console.log('\n🚀 Vercel CLI: deploying to production...');
  execSync('npx vercel@latest --prod --yes', { cwd: ROOT, env, stdio: 'inherit' });
}

(async () => {
  console.log(`🚀 Starfeet Sync — "${MESSAGE}"`);
  if (!SKIP_GITHUB) {
    const token = getGhToken();
    await syncGitHubAtomic(token);
  }
  if (USE_VERCEL_CLI || SKIP_GITHUB) syncVercelCli();
  else {
    console.log('\n💡 GitHub push done. Vercel auto-deploys if project is linked.');
  }
})();