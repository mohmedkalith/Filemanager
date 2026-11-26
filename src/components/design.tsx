import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FileEntry } from '../core/models';
import { formatBytes, kindOf } from '../core/models';

export const colors = { background: '#F8FAFC', surface: '#FFFFFF', ink: '#0F172A', secondary: '#64748B', muted: '#94A3B8', border: '#E2E8F0', primary: '#6366F1', soft: '#EEF2FF', green: '#22C55E', orange: '#F59E0B', red: '#EF4444' };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const kindStyles: Record<string, { icon: IconName; color: string; background: string }> = {
  Folder: { icon: 'folder', color: '#D99739', background: '#FFF4DF' },
  Document: { icon: 'document-text', color: '#5C7EDB', background: '#EDF2FF' },
  Image: { icon: 'image', color: '#AD70D9', background: '#F6EDFC' },
  Video: { icon: 'videocam', color: '#E27878', background: '#FFF0F0' },
  Audio: { icon: 'musical-notes', color: '#E086A3', background: '#FFF0F5' },
  Archive: { icon: 'archive', color: '#BE8B51', background: '#FCF2E7' },
  Code: { icon: 'code-slash', color: '#5B8CCB', background: '#EDF6FF' },
  Spreadsheet: { icon: 'grid', color: '#46A87B', background: '#E8F7EE' },
  Other: { icon: 'document', color: '#8795AA', background: '#F0F3F7' },
};

export function IconBox({ icon, color = colors.primary, background = colors.soft, size = 42 }: { icon: IconName; color?: string; background?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: background }}><Ionicons name={icon} size={size * .48} color={color}/></View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[styles.card, style]}>{children}</View>; }
export function SectionTitle({ title, subtitle, action, onPress }: { title: string; subtitle?: string; action?: string; onPress?: () => void }) {
  return <View style={styles.section}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}</View>{action && onPress ? <Pressable onPress={onPress} accessibilityRole="button"><Text style={styles.link}>{action}</Text></Pressable> : null}</View>;
}
export function FileRow({ entry, onPress, onMore, selected = false, onSelect }: { entry: FileEntry; onPress: () => void; onMore: () => void; selected?: boolean; onSelect?: () => void }) {
  const kind = kindOf(entry); const style = kindStyles[kind];
  return <Pressable onPress={onPress} onLongPress={onSelect} accessibilityRole="button" style={[styles.row, selected && { backgroundColor: colors.soft }]}>
    <IconBox {...style}/><View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}><Text numberOfLines={1} style={styles.fileName}>{entry.name}</Text><Text numberOfLines={1} style={styles.fileSub}>{kind}{entry.isDirectory ? '' : ` · ${formatBytes(entry.size)}`}</Text></View>
    {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary}/> : null}
    <Pressable onPress={onMore} hitSlop={12} accessibilityLabel={`Actions for ${entry.name}`} style={{ padding: 8 }}><Ionicons name="ellipsis-horizontal" size={20} color={colors.muted}/></Pressable>
  </Pressable>;
}
export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  section: { flexDirection: 'row', alignItems: 'center', marginTop: 27, marginBottom: 13 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -.3 },
  sectionSub: { color: colors.secondary, fontSize: 12, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 70, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fileName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  fileSub: { color: colors.secondary, fontSize: 11, marginTop: 5 },
});
