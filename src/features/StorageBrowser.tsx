import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FileEntry } from '../core/models';
import { extension, formatBytes, kindOf, mediaType } from '../core/models';
import { FileStore } from '../core/fileStore';
import { chooseTree, listTree, readTreeText } from '../core/storageTree';
import { colors, FileRow } from '../components/design';
import { AudioPlayer, VideoPlayer } from './MediaPlayer';

const TREE_KEY = '@fileos/selected-tree';
const textTypes = new Set('txt md log csv tsv json xml yaml yml toml ini env config html css scss js ts tsx dart py java kt c cpp h cs php rb rs go sql sh bat srt vtt ass'.split(' '));
const imageTypes = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
type Crumb = { uri: string; label: string };

export function StorageBrowser({ store, hidden, onClose, onImported }: { store: FileStore; hidden: boolean; onClose: () => void; onImported: () => void }) {
  const [tree, setTree] = useState<string | null>(null);
  const [stack, setStack] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const listGeneration = useRef(0);
  const current = stack[stack.length - 1];

  useEffect(() => { let active = true; AsyncStorage.getItem(TREE_KEY).then(uri => { if (active && uri) { setTree(uri); setStack([{ uri, label: 'Selected folder' }]); } }).catch(() => { if (active) setError('Could not restore the saved folder. Select it again.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!tree || !current) return;
    const request = ++listGeneration.current;
    setLoading(true); setError('');
    try { const result = await listTree(tree, current.uri, hidden); if (request === listGeneration.current) setEntries(result); } catch (e) { if (request === listGeneration.current) { setEntries([]); setError(e instanceof Error ? e.message : String(e)); } } finally { if (request === listGeneration.current) setLoading(false); }
  }, [tree, current?.uri, hidden]);
  useEffect(() => { if (!tree || !current) return; const request = ++listGeneration.current; setLoading(true); setError(''); listTree(tree, current.uri, hidden).then(data => { if (request === listGeneration.current) setEntries(data); }).catch(e => { if (request === listGeneration.current) { setEntries([]); setError(e instanceof Error ? e.message : String(e)); } }).finally(() => { if (request === listGeneration.current) setLoading(false); }); return () => { if (request === listGeneration.current) listGeneration.current++; }; }, [tree, current?.uri, hidden]);

  const selectFolder = async () => {
    try {
      const selected = await chooseTree();
      if (!selected) return;
      setTree(selected); setStack([{ uri: selected, label: 'Selected folder' }]); setQuery(''); setEntries([]); setError('');
      try { await AsyncStorage.setItem(TREE_KEY, selected); } catch { Alert.alert('Folder not remembered', 'The folder is available now, but you may need to select it again next time.'); }
    } catch (e) { Alert.alert('Unable to select folder', e instanceof Error ? e.message : String(e)); }
  };
  const open = async (item: FileEntry) => {
    if (item.isDirectory) { setStack(old => [...old, { uri: item.uri, label: item.name }]); setQuery(''); return; }
    setPreview(item);
  };
  useEffect(() => {
    let active = true;
    setText(null); setPreviewError('');
    if (preview && tree && textTypes.has(extension(preview.name))) {
      readTreeText(tree, preview.uri).then(value => { if (active) setText(value); }).catch(e => { if (active) setPreviewError(e instanceof Error ? e.message : String(e)); });
    }
    return () => { active = false; };
  }, [preview, tree]);
  const importItem = async (item: FileEntry) => {
    if (item.isDirectory) { Alert.alert('Folder import unavailable', 'Open the folder and import individual files.'); return; }
    if (item.hasName === false) { Alert.alert('Import unavailable', 'The storage provider did not supply a file name.'); return; }
    if (busy) return;
    setBusy(true);
    try { await store.importFile(item.uri, store.root, item.name); onImported(); Alert.alert('Imported', 'A copy was saved in FileOS app storage. The original was not changed.'); }
    catch (e) { Alert.alert('Import failed', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const shown = entries.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  if (preview) {
    const ext = extension(preview.name);
    const media = mediaType(preview.name);
    return <View style={s.screen}><View style={s.header}><Pressable onPress={() => setPreview(null)} hitSlop={10}><Ionicons name="arrow-back" size={23} color={colors.ink}/></Pressable><Text style={s.title} numberOfLines={1}>{preview.name}</Text><Pressable onPress={() => importItem(preview)} disabled={busy}><Ionicons name="download-outline" size={22} color={colors.primary}/></Pressable></View><Text style={s.note}>{kindOf(preview)} · {formatBytes(preview.size)} · Original in selected folder</Text>
      {media === 'video' ? <VideoPlayer uri={preview.uri}/> : media === 'audio' ? <AudioPlayer uri={preview.uri} name={preview.name}/> : imageTypes.has(ext) ? <View style={s.imageArea}><Image source={{ uri: preview.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" onError={() => setPreviewError('This image could not be decoded on this device.')}/></View> : textTypes.has(ext) ? <ScrollView contentContainerStyle={{ padding: 20 }}>{text === null && !previewError ? <ActivityIndicator color={colors.primary}/> : <Text selectable style={s.text}>{text}</Text>}</ScrollView> : <View style={s.center}><Ionicons name="document-outline" size={46} color={colors.muted}/><Text style={s.emptyTitle}>Preview not available</Text><Text style={s.hint}>Import a copy into FileOS to share it with another app.</Text><Pressable style={s.button} onPress={() => importItem(preview)} disabled={busy}><Text style={s.buttonText}>Import a copy</Text></Pressable></View>}
      {previewError ? <Text style={s.error}>{previewError}</Text> : null}
    </View>;
  }
  return <View style={s.screen}>
    <View style={s.header}><Pressable onPress={onClose} hitSlop={10}><Ionicons name="arrow-back" size={23} color={colors.ink}/></Pressable><Text style={s.title}>Device folders</Text><Pressable onPress={selectFolder}><Text style={s.action}>Choose folder</Text></Pressable></View>
    <Text style={s.note}>Read-only browsing · Android grants access only to the folder you choose. Import makes a copy.</Text>
    {tree && current ? <><View style={s.path}><Pressable onPress={() => { if (stack.length > 1) { setStack(stack.slice(0, -1)); setQuery(''); } }} disabled={stack.length <= 1}><Ionicons name="arrow-up" size={20} color={stack.length > 1 ? colors.primary : colors.muted}/></Pressable><Text numberOfLines={1} style={s.pathText}>{current.label}</Text><Pressable onPress={refresh}><Ionicons name="refresh" size={20} color={colors.secondary}/></Pressable></View><TextInput value={query} onChangeText={setQuery} placeholder="Filter this folder" placeholderTextColor={colors.muted} style={s.input}/></> : null}
    {loading ? <View style={s.center}><ActivityIndicator color={colors.primary}/></View> : error ? <View style={s.center}><Ionicons name="warning-outline" color={colors.orange} size={38}/><Text style={s.emptyTitle}>Folder unavailable</Text><Text style={s.hint}>{error}</Text><Text style={s.hint}>Permission may have been revoked. Choose the folder again.</Text><Pressable style={s.button} onPress={selectFolder}><Text style={s.buttonText}>Choose folder</Text></Pressable></View> : !tree ? <View style={s.center}><Ionicons name="folder-open-outline" size={46} color={colors.muted}/><Text style={s.emptyTitle}>Choose a folder</Text><Text style={s.hint}>Browse files from a location you grant access to, including supported storage providers.</Text><Pressable style={s.button} onPress={selectFolder}><Text style={s.buttonText}>Choose folder</Text></Pressable></View> : <FlatList data={shown} keyExtractor={item => item.uri} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 20 }} renderItem={({ item }) => <FileRow entry={item} onPress={() => void open(item)} onMore={() => item.isDirectory ? void open(item) : Alert.alert(item.name, 'Import a copy into FileOS app storage?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Import copy', onPress: () => void importItem(item) }])}/>} ListEmptyComponent={<View style={s.center}><Text style={s.emptyTitle}>No files found</Text><Text style={s.hint}>This folder is empty or has no matching items.</Text></View>}/>}
  </View>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 15, borderBottomWidth: 1, borderBottomColor: colors.border }, title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink }, action: { color: colors.primary, fontSize: 12, fontWeight: '700' }, note: { paddingHorizontal: 20, paddingVertical: 12, fontSize: 11, color: colors.secondary, backgroundColor: colors.background, lineHeight: 17 }, path: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14 }, pathText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink }, input: { height: 42, backgroundColor: '#F1F5F9', marginHorizontal: 20, marginTop: 12, marginBottom: 8, paddingHorizontal: 12, borderRadius: 10, color: colors.ink }, center: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', padding: 25 }, emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 14 }, hint: { fontSize: 12, lineHeight: 18, color: colors.secondary, textAlign: 'center', marginTop: 8 }, button: { marginTop: 18, borderRadius: 10, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 }, imageArea: { flex: 1, backgroundColor: colors.background }, text: { fontFamily: 'monospace', fontSize: 13, lineHeight: 22, color: colors.ink }, error: { color: '#991B1B', backgroundColor: '#FEF2F2', padding: 16 } });
