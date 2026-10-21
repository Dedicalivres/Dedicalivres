import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const BASE = 'https://dedicalivres.fr/';
const PAGES_WORKFLOW_ID = 264484297;
const fail = message => { throw new Error(`STOP preuve publication : ${message}`); };
const same = (a, b) => a.length === b.length && a.equals(b);

export async function verifyPagesFiles({sha, paths, repository, token, fetcher = fetch,
  readFile = file => fs.readFileSync(file)}) {
  if (!/^[0-9a-f]{40}$/.test(sha || '') || !repository || !token
      || !Array.isArray(paths) || !paths.length || paths.length > 250
      || new Set(paths).size !== paths.length || paths.some(p => !/^[a-zA-Z0-9_./-]+$/.test(p) || p.startsWith('/') || p.split('/').includes('..')))
    fail('paramètres de fichiers Pages invalides');
  const api = await fetcher(`https://api.github.com/repos/${repository}/actions/workflows/${PAGES_WORKFLOW_ID}/runs?head_sha=${sha}&per_page=100`, {
    headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(20000),
  });
  if (!api.ok) fail(`GitHub Pages HTTP ${api.status}`);
  const runs = (await api.json()).workflow_runs;
  const run = Array.isArray(runs) && runs.find(item => item.head_sha === sha
    && item.workflow_id === PAGES_WORKFLOW_ID && item.name === 'pages build and deployment'
    && item.status === 'completed' && item.conclusion === 'success');
  if (!run || !Number.isInteger(run.id)) fail('déploiement Pages du commit non confirmé');

  const deployed = async relative => fetcher(`${BASE}${relative}?publication=${sha}-${Date.now()}`,
    {cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(20000)});
  for (const file of paths) {
    const remote = await deployed(file);
    if (remote.status !== 200 || !same(Buffer.from(await remote.arrayBuffer()), readFile(file))) {
      fail(`fichier public non synchronisé : ${file}`);
    }
  }

  return {sha, pages_run_id:run.id, verified:true, file_count:paths.length};
}

export async function verifyDeployment({sha, jobs, oldMap, currentMap, depublishPaths = [],
  repository, token, fetcher = fetch, readFile = file => fs.readFileSync(file)}) {
  if (!/^[0-9a-f]{40}$/.test(sha || '') || !Array.isArray(jobs) || jobs.length < 1
      || !repository || !token || !Array.isArray(depublishPaths)) fail('paramètres absents');
  const proof = await verifyPagesFiles({sha, repository, token, fetcher, readFile,
    paths:['sitemap-evenements.xml', 'event-canonical.js',
      'docs/territoires/event-canonical-map.json', 'evenement/index.html', 'index.html']});
  const deployed = async relative => fetcher(`${BASE}${relative}?publication=${sha}-${Date.now()}`,
    {cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(20000)});

  const sitemap = readFile('sitemap-evenements.xml').toString();
  const seen = new Set();
  for (const job of jobs) {
    if (!job || seen.has(job.id) || !/^[0-9a-f-]{36}$/.test(job.id || '')
        || !/^[0-9a-f-]{36}$/.test(job.event_id || '')) fail('identité de job invalide');
    seen.add(job.id);
    const oldPath = oldMap[job.event_id];
    const newPath = currentMap[job.event_id];
    if (['validation', 'edit'].includes(job.reason)) {
      if (!/^evenement\/[^/]+\.html$/.test(newPath || '')
          || !sitemap.includes(`${BASE}${newPath}`)) fail(`fiche ou sitemap absent : ${job.id}`);
      const remote = await deployed(newPath);
      if (remote.status !== 200 || !same(Buffer.from(await remote.arrayBuffer()), readFile(newPath))) {
        fail(`fiche publique non synchronisée : ${job.id}`);
      }
      if (oldPath && oldPath !== newPath) {
        const previous = await deployed(oldPath);
        if (![404, 410].includes(previous.status) || sitemap.includes(`${BASE}${oldPath}`)) {
          fail(`ancienne fiche toujours accessible : ${job.id}`);
        }
      }
    } else if (['unpublish', 'delete'].includes(job.reason)) {
      if (newPath || !oldPath || !depublishPaths.includes(oldPath)
          || sitemap.includes(`${BASE}${oldPath}`)) fail(`dépublication incohérente : ${job.id}`);
      const previous = await deployed(oldPath);
      if (![404, 410].includes(previous.status)) fail(`fiche dépubliée encore accessible : ${job.id}`);
    } else fail(`raison non publiable : ${job.id}`);
  }
  return {sha, pages_run_id:proof.pages_run_id, verified:true, job_count:jobs.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.PUBLICATION_SHA;
  const jobs = JSON.parse(process.env.PUBLICATION_JOBS || 'null');
  const depublishPaths = JSON.parse(process.env.PUBLICATION_DEPUBLISH_PATHS || '[]');
  const currentMap = JSON.parse(fs.readFileSync('docs/territoires/event-canonical-map.json'));
  const oldMap = JSON.parse(execFileSync('git', ['show', `${sha}^:docs/territoires/event-canonical-map.json`],
    {encoding:'utf8'}));
  let proof;
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      proof = await verifyDeployment({sha, jobs, oldMap, currentMap, depublishPaths,
        repository:process.env.GITHUB_REPOSITORY, token:process.env.GITHUB_TOKEN});
      break;
    } catch (error) {
      if (attempt === 60) throw error;
      console.log(`${error.message} ; attente ${attempt}/60`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `proof=${JSON.stringify(proof)}\n`);
  console.log(`PASS déploiement Pages #${proof.pages_run_id} : ${proof.job_count} job(s)`);
}
