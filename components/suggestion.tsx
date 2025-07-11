'use client';

// Stub component for Suggestion - feature removed
import { AnimatePresence } from 'framer-motion';
import type { UISuggestion } from '@/lib/editor/suggestions';
import type { ArtifactKind } from './artifact';

// This is a stub component that maintains the same interface but doesn't render anything
// since the suggestion feature has been removed from the application
export const Suggestion = ({
  suggestion,
  onApply,
  artifactKind,
}: {
  suggestion: UISuggestion;
  onApply: () => void;
  artifactKind: ArtifactKind;
}) => {
  // Return null instead of rendering anything
  return <AnimatePresence />;
};
