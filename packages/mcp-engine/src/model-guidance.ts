// Copyright (c) The Malloy Foundation
// SPDX-License-Identifier: MIT

// Model-contributed guidance: a published model may ship its OWN help topics —
// domain rulings, vocabulary, canonical patterns — as markdown files under
// `guidance/` in the model directory, alongside index.malloy. They travel with
// the model (publish/refresh ingest them like any model file) and are served
// through yo_help, the one guidance channel every host has (see
// docs/explore-surface.md "Delivery model").
//
// The naming rule is help.ts's: the topic name IS the file path (slugged,
// `.md` dropped) — `guidance/sales.md` → `guidance/sales`. A host serving
// several models prefixes a namespace (its model_ref) so two models' topics
// can't collide; yo_help's substring rung still resolves the short name.

import type { HelpTopic } from './types';

/** A model-contributed topic: a HelpTopic plus the one-line description its
    front matter carries (used to index it in instructions and catalogs). */
export interface GuidanceTopic extends HelpTopic {
  description?: string;
  /** Front matter `pin: true` — a PINNED topic is standing rules: its whole
      body is inlined into the instructions lead-block, not just indexed.
      For the short must-always-hold rules (data fidelity, presentation);
      long reference topics stay unpinned and ride yo_help. */
  pinned?: boolean;
}

const GUIDANCE_DIR = 'guidance/';

/** Lowercase-kebab one path segment — the same rule help.ts applies. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function nameFromPath(path: string): string {
  return path
    .replace(/\.md$/, '')
    .split('/')
    .map(slugify)
    .join('/');
}

/** Markdown with optional YAML-ish front matter carrying `description:` and
    `pin:` (true → inline the body in instructions, not just the index line). */
function parseTopic(name: string, raw: string): GuidanceTopic {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) return { name, body: raw.trim() };
  const front = m[1] ?? '';
  const d = /^description:\s*(.+)$/m.exec(front);
  const topic: GuidanceTopic = { name, body: (m[2] ?? '').trim() };
  const description = d?.[1]?.trim();
  if (description) topic.description = description;
  if (/^pin:\s*true\s*$/m.test(front)) topic.pinned = true;
  return topic;
}

/**
 * The guidance topics a model's file set contributes: every `guidance/**\/*.md`
 * in `files` (path → content, as publish stores them), named by path. A
 * `namespace` (a host's model_ref) prefixes every name — pass one whenever the
 * serving host offers more than one model.
 */
export function modelGuidanceTopics(
  files: Iterable<[string, string]>,
  namespace?: string,
): GuidanceTopic[] {
  const topics: GuidanceTopic[] = [];
  const prefix = namespace ? `${slugify(namespace)}/` : '';
  for (const [path, content] of files) {
    if (!path.startsWith(GUIDANCE_DIR) || !path.endsWith('.md')) continue;
    topics.push(parseTopic(prefix + nameFromPath(path), content));
  }
  return topics.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The instructions lead-block announcing a model's guidance. PINNED topics
 * (front matter `pin: true`) contribute their whole body — standing rules the
 * agent must hold without a yo_help round trip. Everything else stays a
 * one-line index entry (instructions are a capped, best-effort channel; the
 * bodies ride yo_help). Pinned bodies lead; the index trails, and still lists
 * the pinned names so an agent can re-read them by name.
 */
export function guidanceInstructionsBlock(topics: GuidanceTopic[]): string {
  if (topics.length === 0) return '';
  const pinned = topics.filter((t) => t.pinned && t.body).map((t) => t.body);
  const lines = topics.map(
    (t) => `- \`${t.name}\`${t.description ? ` — ${t.description}` : ''}`,
  );
  const index =
    'This model publishes its own guidance — domain rules that change the numbers. ' +
    'Read the relevant topic with yo_help BEFORE writing a query:\n' +
    lines.join('\n');
  return [...pinned, index].join('\n\n');
}
