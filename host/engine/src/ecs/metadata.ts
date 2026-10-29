/**
 * Name and Metadata components for ECS entities.
 */
import type { Component } from './component';

export interface NameComponent extends Component {
  readonly type: 'Name';
  name: string;
}

export function createName(name: string): NameComponent {
  return {
    type: 'Name',
    name
  };
}

export interface MetadataComponent extends Component {
  readonly type: 'Metadata';
  readonly entries: Map<string, unknown>;
}

export function createMetadata(
  initial?: Record<string, unknown> | Map<string, unknown>
): MetadataComponent {
  const entries = new Map<string, unknown>();
  if (initial) {
    if (initial instanceof Map) {
      for (const [key, value] of initial.entries()) {
        entries.set(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(initial)) {
        entries.set(key, value);
      }
    }
  }

  return {
    type: 'Metadata',
    entries
  };
}
