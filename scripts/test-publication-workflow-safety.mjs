import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/publish-events.yml', 'utf8');
const worker = fs.readFileSync('scripts/publication-jobs.mjs', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261012155223_publication_batch_state_machine.sql', 'utf8');

assert.match(workflow, /vars\.PUBLICATION_AUTOMATION_ENABLED == 'true'/);
assert.match(workflow, /inputs\.preactivation_test != true/);
assert.match(workflow, /inputs\.recover_failed_p0 != true/);
assert.match(workflow, /github\.event_name == 'workflow_dispatch'[\s\S]*inputs\.publish_douai == true/);
assert.match(workflow, /PUBLICATION_DOUAI_MANUAL:[\s\S]*github\.event_name == 'workflow_dispatch'/);
assert.doesNotMatch(
  workflow.match(/schedule:[\s\S]*?jobs:/)?.[0] || "",
  /publish_douai/
);
const preflightPosition = workflow.indexOf('- name: Preflight publication queue');
const setupNodePosition = workflow.indexOf('- name: Setup Node');
const setupPythonPosition = workflow.indexOf('- name: Setup Python');
const installPosition = workflow.indexOf('- name: Install publisher dependencies');
const claimPosition = workflow.indexOf('- name: Claim publication jobs');
assert.ok(preflightPosition > 0 && preflightPosition < setupNodePosition
  && preflightPosition < setupPythonPosition && preflightPosition < installPosition
  && preflightPosition < claimPosition);
assert.match(workflow, /Setup Node\n\s+if: steps\.preflight\.outputs\.has_pending == 'true'/);
assert.match(workflow, /Setup Python\n\s+if: steps\.preflight\.outputs\.has_pending == 'true'/);
assert.match(workflow, /Read public Supabase configuration\n\s+if: steps\.preflight\.outputs\.has_pending == 'true'/);
assert.match(workflow, /Install publisher dependencies\n\s+if: steps\.preflight\.outputs\.has_pending == 'true'/);
assert.match(workflow, /Claim publication jobs\n\s+id: claim\n\n\s+if: steps\.preflight\.outputs\.has_pending == 'true'/);
assert.match(worker, /const AUTOMATIC_BATCH_LIMIT = 3/);
assert.match(worker, /claim_publication_canary_batch/);
assert.match(worker, /publication_canary_candidate/);
assert.match(workflow, /github\.event_name == 'schedule'\s*&& vars\.PUBLICATION_AUTOMATION_ENABLED == 'true'/);
assert.match(workflow, /Persist automatic CANARY incident/);
assert.match(worker, /préactivation réelle retirée/);
assert.doesNotMatch(worker.match(/async function claim\(\)[\s\S]*?async function success/)[0],
  /await recoverStaleJobs\(/);
console.log('PASS préactivation et RUNNING ancien sans mutation');

assert.match(workflow, /echo "commit_created=true" >> "\$GITHUB_OUTPUT"[\s\S]*?git push/);
assert.match(workflow, /steps\.publish\.outcome != 'success'[\s\S]*?steps\.publish\.outputs\.commit_created != 'true'/);
assert.match(workflow, /steps\.publish\.outcome == 'success'[\s\S]*?steps\.publish\.outputs\.commit_created == 'true'/);
console.log('PASS échec précommit réessayable, push/commit incertains conservés RUNNING');

const deploymentPosition = workflow.indexOf('- name: Verify production deployment');
const recheckPosition = workflow.indexOf('- name: Recheck source after deployment');
const successPosition = workflow.indexOf('- name: Mark jobs successful');
assert.ok(deploymentPosition > 0 && deploymentPosition < recheckPosition
  && recheckPosition < successPosition);
assert.match(workflow, /PUBLICATION_DEPLOYMENT_PROOF:[\s\S]*steps\.deployment\.outputs\.proof/);
assert.match(worker, /proof\.sha !== commitSha/);
assert.match(worker, /complete_event_publication_batch/);
assert.match(migration, /PUBLICATION_COMPLETION_STALE_BATCH/);
assert.match(migration, /PUBLICATION_COMPLETION_UPDATE_COUNT/);
console.log('PASS preuve déploiement, relecture Supabase, finalisation non silencieuse');
