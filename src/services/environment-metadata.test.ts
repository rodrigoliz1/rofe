import { expect, test } from 'vitest';
// @ts-expect-error Native CLI module shared with the scope audit.
import { auditEnvironmentMetadata } from '../../scripts/audit-environment-metadata.mjs';

test('scope audit detects shared records without copying opaque provider data', () => {
  const report = auditEnvironmentMetadata({ envs: [{ key: 'FINANCIAL_CONFIGURATION', target: ['production', 'preview'], type: 'sensitive', value: 'NEVER-PRINT-THIS', createdBy: 'PRIVATE-OWNER' }] });
  expect(report.status).toBe('ISOLATION_REQUIRED');
  expect(report.sharedNames).toEqual(['FINANCIAL_CONFIGURATION']);
  expect(JSON.stringify(report)).not.toMatch(/NEVER-PRINT|PRIVATE-OWNER/);
});
test('scope audit accepts records confined to their own environments', () => {
  expect(auditEnvironmentMetadata({ envs: [{ key: 'CONFIGURATION', target: ['production'] }, { key: 'CONFIGURATION', target: ['preview'] }] }).status).toBe('SCOPES_SEPARATED');
});
