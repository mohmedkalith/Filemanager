import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import type { FileEntry } from '../core/models';
import { extension, formatBytes, kindOf } from '../core/models';
import { FileStore } from '../core/fileStore';
import { colors } from '../components/design';

const textExtensions = new Set('txt md log csv tsv json xml yaml yml toml ini env config html css scss js ts tsx dart py java kt c cpp h cs php rb rs go sql sh bat srt vtt ass'.split(' '));
const imageExtensions = new Set(['png','jpg','jpeg','gif','webp','bmp']);
export function Preview({ item, store, close }: { item: FileEntry; store: FileStore; close: () => void }) {
  const ext = extension(item.name); const isText = textExtensions.has(ext); const isImage = imageExtensions.has(ext);
  const [text, setText] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; if (isText) store.readText(item).then(value => { if (active) setText(value); }).catch(e => { if (active) setError(String(e.message || e)); }); return () => { active = false; }; }, [item, store, isText]);
  const share = async () => { try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(item.uri); else setError('Sharing is unavailable on this device.'); } catch (e) { setError(String(e)); } };
  return <View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={close} hitSlop={12}><Ionicons name="arrow-back" size={23} color={colors.ink}/></Pressable><Text numberOfLines={1} style={styles.title}>{item.name}</Text><Pressable onPress={share} hitSlop={12} accessibilityLabel="Share file"><Ionicons name="share-outline" size={22} color={colors.ink}/></Pressable></View>
    <View style={styles.meta}><Text style={styles.metaText}>{kindOf(item)} · {formatBytes(item.size)}</Text></View>
    {isImage ? <View style={styles.imageArea}><Image source={{ uri: item.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onError={() => setError('This image could not be decoded on this device.')}/></View> : isText ? <ScrollView contentContainerStyle={{ padding: 20 }}>{text === null && !error ? <ActivityIndicator color={colors.primary}/> : <Text selectable style={styles.text}>{text}</Text>}</ScrollView> : <View style={styles.empty}><Ionicons name="document-outline" size={48} color={colors.muted}/><Text style={styles.emptyTitle}>Preview not available</Text><Text style={styles.emptyText}>This format does not have a built-in viewer yet. You can share the file with another app.</Text><Pressable style={styles.shareButton} onPress={share}><Text style={{ color: '#fff', fontWeight: '700' }}>Share file</Text></Pressable></View>}
    {error ? <View style={styles.error}><Text style={{ color: '#991B1B' }}>{error}</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 18, borderBottomWidth: 1, borderBottomColor: colors.border }, title: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.background }, metaText: { color: colors.secondary, fontSize: 12 }, imageArea: { flex: 1, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, text: { color: colors.ink, fontFamily: 'monospace', lineHeight: 22, fontSize: 13 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }, emptyTitle: { marginTop: 16, fontSize: 17, color: colors.ink, fontWeight: '700' }, emptyText: { marginTop: 8, color: colors.secondary, textAlign: 'center', lineHeight: 20 }, shareButton: { marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }, error: { backgroundColor: '#FEF2F2', padding: 16 } });
