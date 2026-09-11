import type { CapabilityDefinition, CapabilityName } from './contracts.js';
import { draftCapabilities, readCapabilities } from './contracts.js';

const r0 = new Set<CapabilityName>(['scm.repository.list', 'scm.repository.read', 'drive.file.metadata.read']);
const r2 = new Set<CapabilityName>(['mail.thread.search', 'mail.thread.read', 'mail.message.read', 'drive.file.search', 'drive.file.content.read']);

export const capabilityCatalog: ReadonlyMap<string, CapabilityDefinition> = new Map(
  [...readCapabilities, ...draftCapabilities].map((capability): [string, CapabilityDefinition] => {
    const write = (draftCapabilities as readonly string[]).includes(capability);
    const effect = write ? 'W1' : r0.has(capability) ? 'R0' : r2.has(capability) ? 'R2' : 'R1';
    return [capability, {
      schema_version: 1,
      capability,
      effect_class: effect,
      side_effect: write ? 'reversible_write' : 'none',
      consent_floor: write ? 'prompt_each_call' : effect === 'R2' ? 'prompt_each_run' : 'standing_read',
      max_items: write ? 1 : capability.includes('.search') ? 20 : 8,
      max_pages: write ? 1 : 2,
      page_size: write ? 1 : capability.includes('.search') ? 20 : 8,
      output_token_limit: capability.startsWith('mail.') ? 4000 : 6000,
      external_content: 'untrusted',
    }];
  }),
);

export const structurallyForbiddenCapabilities = new Set([
  'mail.send', 'mail.delete', 'mail.archive', 'mail.label.update', 'scm.push', 'scm.merge',
  'scm.comment.create', 'issue_tracker.issue.update', 'issue_tracker.comment.create',
  'issue_tracker.transition', 'drive.file.edit', 'drive.file.share', 'drive.file.delete',
]);
