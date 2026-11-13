import type { ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '../theme';
import { SectionHeader } from './SectionHeader';

interface SectionProps {
  title: string;
  /** Passed to SectionHeader (link-style action at the right). */
  actionLabel?: string;
  onAction?: () => void;
  /** Gap between the children (default 8). */
  contentGap?: number;
  children?: ReactNode;
}

// A titled group: the title sits close to its content (8dp), while the gap BETWEEN groups comes from the screen
// container. A View with `gap` is the React Native way to do what you would do with a flex column + gap in CSS.
export function Section({ title, actionLabel, onAction, contentGap = spacing.sm, children }: SectionProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
      <View style={{ gap: contentGap }}>{children}</View>
    </View>
  );
}
