import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import {
  DecorationSet,
  type EditorView,
} from 'prosemirror-view';

import type { Suggestion } from '@/lib/db/schema';
import type { ArtifactKind } from '@/components/artifact';

// This is a stub implementation since the suggestions feature has been removed
// It maintains the same interface but doesn't actually do anything

// Extended interface for UI suggestions
export interface UISuggestion extends Suggestion {
  selectionStart: number;
  selectionEnd: number;
}

// Stub implementation that returns empty arrays
export function projectWithPositions(
  doc: Node,
  suggestions: Array<Suggestion>,
): Array<UISuggestion> {
  // Return empty array since suggestions feature is removed
  return [];
}

// Stub implementation of createSuggestionWidget
export function createSuggestionWidget(
  view: EditorView,
  suggestion: UISuggestion,
  artifactKind: ArtifactKind,
) {
  // Create a minimal implementation that does nothing
  const dom = document.createElement('div');
  
  return {
    dom,
    destroy: () => {
      // No-op
    },
  };
}

// Stub implementation of the suggestions plugin
export const suggestionsPluginKey = new PluginKey('suggestions');
export const suggestionsPlugin = new Plugin({
  key: suggestionsPluginKey,
  state: {
    init() {
      return { decorations: DecorationSet.empty, selected: null };
    },
    apply(tr, state) {
      const newDecorations = tr.getMeta(suggestionsPluginKey);
      if (newDecorations) return newDecorations;

      return {
        decorations: state.decorations.map(tr.mapping, tr.doc),
        selected: state.selected,
      };
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});
