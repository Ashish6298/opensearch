#!/usr/bin/env node
/**
 * @opensearch/scripts — Publication Safety Guard (Phase 120)
 *
 * Enforces repository hygiene and prevents accidental publication
 * of private monorepo packages to public registries without
 * explicit configuration and authorization.
 */

if (process.env.ALLOW_PUBLISH !== 'true') {
  console.error('\n================================================================================');
  console.error('PUBLICATION GUARD BLOCKED: ACCIDENTAL PUBLISH PREVENTED');
  console.error('================================================================================');
  console.error('OpenSearch packages are private monorepo workspaces and must not be published');
  console.error('to public package registries or container registries without explicit authorization.');
  console.error('');
  console.error('To authorize publication, set:');
  console.error('  ALLOW_PUBLISH=true');
  console.error('');
  console.error('For release procedures, refer to docs/release-and-rollback.md');
  console.error('================================================================================\n');
  process.exit(1);
}

console.log('[PUBLISH GUARD] Explicit publication authorization confirmed (ALLOW_PUBLISH=true).');
