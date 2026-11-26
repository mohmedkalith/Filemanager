import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { FileStore } from './src/core/fileStore';
import { createNativeStore } from './src/core/nativeStore';
import { searchTree } from './src/core/search';
import { FileEntry, FileKind, formatBytes, kindOf } from './src/core/models';
import { Card, colors, FileRow, IconBox, IconName, kindStyles, SectionTitle } from './src/components/design';
import { Preview } from './src/features/Preview';
import { StorageBrowser } from './src/features/StorageBrowser';

type Page = 'Home' | 'Files' | 'Search' | 'Favorites' | 'More' | 'Recent';
type NameAction = { type: 'folder' | 'file' | 'rename'; item?: FileEntry };
const LAST = '@fileos/recent'; const FAV = '@fileos/favorites'; const HIDDEN = '@fileos/hidden';
const navigation: { page: Page; icon: IconName; active: IconName }[] = [
  { page: 'Home', icon: 'grid-outline', active: 'grid' }, { page: 'Files', icon: 'folder-outline', active: 'folder' },
  { page: 'Search', icon: 'search-outline', active: 'search' }, { page: 'Favorites', icon: 'star-outline', active: 'star' },
  { page: 'More', icon: 'ellipsis-horizontal-circle-outline', active: 'ellipsis-horizontal-circle' },
];
const uriWithin = (path: string, parent: string) => path === parent || path.startsWith(parent + '/');
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function App() {
  const { width } = useWindowDimensions(); const wide = width >= 800;
  const [deviceBrowser, setDeviceBrowser] = useState(false);
  const [storage, setStorage] = useState<{ total: number; free: number } | null>(null);
  const [store, setStore] = useState<FileStore | null>(null); const [directory, setDirectory] = useState('');
  const [page, setPage] = useState<Page>('Home'); const [entries, setEntries] = useState<FileEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]); const [recents, setRecents] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FileEntry[]>([]); const [recentItems, setRecentItems] = useState<FileEntry[]>([]);
  const [hidden, setHidden] = useState(false); const [query, setQuery] = useState(''); const [category, setCategory] = useState<FileKind | null>(null);
  const [history, setHistory] = useState<string[]>([]); const [historyIndex, setHistoryIndex] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<FileEntry | null>(null); const [preview, setPreview] = useState<FileEntry | null>(null);
  const [selected, setSelected] = useState<string[]>([]); const [clipboard, setClipboard] = useState<{ paths: string[]; move: boolean } | null>(null);
  const [nameAction, setNameAction] = useState<NameAction | null>(null); const [name, setName] = useState('');
  const [sort, setSort] = useState<'name' | 'modified' | 'size'>('name');
  const [deepResults, setDeepResults] = useState<FileEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const searchAbort = useRef<AbortController | null>(null);
  const listGeneration = useRef(0);
  const currentDirectory = useRef(directory);
  const currentHidden = useRef(hidden);
  currentDirectory.current = directory;
  currentHidden.current = hidden;
  useEffect(() => () => { searchAbort.current?.abort(); listGeneration.current++; }, []);
  useEffect(() => { let active = true; if (Platform.OS !== 'web') Promise.all([FileSystem.getTotalDiskCapacityAsync(), FileSystem.getFreeDiskStorageAsync()]).then(([total, free]) => { if (active && total > 0 && free >= 0 && free <= total) setStorage({ total, free }); }).catch(() => { if (active) setStorage(null); }); return () => { active = false; }; }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const nextStore = createNativeStore();
        const [fav, recent, show] = await Promise.all([AsyncStorage.getItem(FAV), AsyncStorage.getItem(LAST), AsyncStorage.getItem(HIDDEN)]);
        const parse = (value: string | null): string[] => { try { const data: unknown = JSON.parse(value ?? '[]'); return Array.isArray(data) ? data.filter((v): v is string => typeof v === 'string') : []; } catch { return []; } };
        if (!alive) return;
        setStore(nextStore); setDirectory(nextStore.root); setHistory([nextStore.root]); setFavorites(parse(fav)); setRecents(parse(recent)); setHidden(show === 'true');
      } catch (e) { if (alive) { setError(messageOf(e)); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!store || !directory || directory !== currentDirectory.current || hidden !== currentHidden.current) return;
    const request = ++listGeneration.current;
    setLoading(true); setError(null);
    try { const result = await store.list(directory, hidden); if (request === listGeneration.current) setEntries(result); }
    catch (e) { if (request === listGeneration.current) { setEntries([]); setError(messageOf(e)); } }
    finally { if (request === listGeneration.current) setLoading(false); }
  }, [store, directory, hidden]);
  useEffect(() => {
    if (!store || !directory) return;
    const request = ++listGeneration.current;
    setLoading(true); setError(null);
    store.list(directory, hidden).then(items => { if (request === listGeneration.current) setEntries(items); }).catch(e => { if (request === listGeneration.current) { setEntries([]); setError(messageOf(e)); } }).finally(() => { if (request === listGeneration.current) setLoading(false); });
    return () => { if (request === listGeneration.current) listGeneration.current++; };
  }, [store, directory, hidden]);
  useEffect(() => {
    let alive = true; if (!store) return;
    const resolve = async (paths: string[]) => (await Promise.all(paths.map(path => store.lookup(path).catch(() => null)))).filter((x): x is FileEntry => x !== null);
    Promise.all([resolve(favorites), resolve(recents)]).then(([f, r]) => { if (alive) { setFavoriteItems(f); setRecentItems(r); } });
    return () => { alive = false; };
  }, [store, favorites, recents, entries]);

  const persist = async (key: string, value: string[]) => { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { Alert.alert('Preferences not saved', 'Your files were not affected, but this list may not persist.'); } };
  const updateSaved = async (from: string, to?: string) => {
    const map = (paths: string[]) => paths.flatMap(path => uriWithin(path, from) ? (to ? [to + path.slice(from.length)] : []) : [path]);
    const f = map(favorites), r = map(recents); setFavorites(f); setRecents(r); await Promise.all([persist(FAV, f), persist(LAST, r)]);
  };
  const navigate = (uri: string) => { searchAbort.current?.abort(); setSearching(false); setDeepResults(null); setSearchNote(''); const next = [...history.slice(0, historyIndex + 1), uri]; setHistory(next); setHistoryIndex(next.length - 1); setDirectory(uri); setSelected([]); setCategory(null); setQuery(''); setPage('Files'); };
  const changePage = (next: Page) => { searchAbort.current?.abort(); setSearching(false); setDeepResults(null); setSearchNote(''); setPage(next); setQuery(''); setCategory(null); setSelected([]); };
  const run = async (operation: () => Promise<void>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try { await operation(); await refresh(); if (success) Alert.alert('FileOS', success); }
    catch (e) { Alert.alert('Unable to complete operation', messageOf(e)); await refresh(); }
    finally { setBusy(false); setActive(null); }
  };
  const open = async (item: FileEntry) => {
    if (selected.length) { toggleSelection(item.uri); return; }
    if (item.isDirectory) { navigate(item.uri); return; }
    const next = [item.uri, ...recents.filter(x => x !== item.uri)].slice(0, 30); setRecents(next); await persist(LAST, next); setPreview(item);
  };
  const toggleFavorite = async (item: FileEntry) => { const next = favorites.includes(item.uri) ? favorites.filter(x => x !== item.uri) : [...favorites, item.uri]; setFavorites(next); await persist(FAV, next); setActive(null); };
  const toggleSelection = (uri: string) => setSelected(old => old.includes(uri) ? old.filter(x => x !== uri) : [...old, uri]);
  const askName = (type: NameAction['type'], item?: FileEntry) => { setActive(null); setName(type === 'rename' ? item?.name ?? '' : ''); setNameAction({ type, item }); };
  const saveName = async () => {
    if (!store || !nameAction) return;
    const action = nameAction; const value = name; setNameAction(null);
    await run(async () => {
      if (action.type === 'rename' && action.item) { const target = await store.rename(action.item, value); await updateSaved(action.item.uri, target); }
      else await store.create(directory, value, action.type === 'folder');
    }, action.type === 'rename' ? 'Item renamed.' : 'Created successfully.');
  };
  const remove = (items: FileEntry[]) => {
    if (!store || !items.length) return;
    Alert.alert('Delete permanently?', `${items.length === 1 ? `“${items[0].name}”` : `${items.length} items`} and any contents will be deleted. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
        void run(async () => {
          // Collapse nested selections so a folder and its child are not deleted twice.
          const top = items.filter(x => !items.some(y => x.uri !== y.uri && uriWithin(x.uri, y.uri)));
          let deleted = 0; const failed: string[] = []; let f = [...favorites]; let r = [...recents];
          for (const item of top) { try { await store.remove(item.uri); deleted++; f = f.filter(x => !uriWithin(x, item.uri)); r = r.filter(x => !uriWithin(x, item.uri)); } catch { failed.push(item.name); } }
          setFavorites(f); setRecents(r); await Promise.all([persist(FAV, f), persist(LAST, r)]); setSelected([]);
          if (failed.length) throw new Error(`${deleted} deleted; ${failed.length} failed: ${failed.join(', ')}`);
        }, 'Deleted permanently.');
      } },
    ]);
  };
  const stage = (paths: string[], move: boolean) => { setClipboard({ paths, move }); setSelected([]); setActive(null); Alert.alert(move ? 'Ready to move' : 'Ready to copy', 'Open a destination folder and tap Paste.'); };
  const paste = () => {
    if (!store || !clipboard) return; const current = clipboard;
    void run(async () => {
      const failed: string[] = []; let firstError = ''; let complete = 0;
      let f = [...favorites], r = [...recents];
      const paths = current.paths.filter(x => !current.paths.some(y => x !== y && uriWithin(x, y)));
      for (const path of paths) {
        try {
          const target = await store.transfer(path, directory, current.move); complete++;
          if (current.move) { f = f.map(x => uriWithin(x, path) ? target + x.slice(path.length) : x); r = r.map(x => uriWithin(x, path) ? target + x.slice(path.length) : x); }
        } catch (e) { failed.push(path); firstError ||= messageOf(e); }
      }
      setFavorites(f); setRecents(r); await Promise.all([persist(FAV, f), persist(LAST, r)]);
      if (current.move) setClipboard(failed.length ? { paths: failed, move: true } : null);
      if (failed.length) throw new Error(`${complete} completed, ${failed.length} failed. ${firstError}`);
    }, current.move ? 'Moved successfully.' : 'Copied successfully.');
  };
  const importFiles = async () => {
    if (!store) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      await run(async () => { let done = 0; const failures: string[] = []; for (const file of result.assets) { try { await store.importFile(file.uri, directory, file.name); done++; } catch { failures.push(file.name); } } if (failures.length) throw new Error(`${done} imported; could not import ${failures.join(', ')}. Existing files are not overwritten.`); }, 'Files imported into app storage.');
    } catch (e) { Alert.alert('Unable to import', messageOf(e)); }
  };
  const startDeepSearch = async () => {
    if (!store || !query.trim()) return;
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller;
    setSearching(true); setDeepResults([]); setSearchNote('Searching this folder and its subfolders…');
    const found: FileEntry[] = []; let skipped = 0; let truncated = false;
    try {
      for await (const event of searchTree(store, directory, query, { showHidden: hidden, signal: controller.signal })) {
        if (controller.signal.aborted) break;
        if (event.type === 'match') { found.push(event.entry); setDeepResults([...found]); }
        if (event.type === 'skipped') skipped++;
        if (event.type === 'limit') truncated = true;
      }
      if (!controller.signal.aborted) setSearchNote(`${found.length} results${truncated ? ' · 500-result limit reached' : ''}${skipped ? ` · ${skipped} folders could not be read` : ''}`);
    } catch (e) { if (!controller.signal.aborted) setSearchNote(`Search failed: ${messageOf(e)}`); }
    finally { if (searchAbort.current === controller) setSearching(false); }
  };
  const source = page === 'Favorites' ? favoriteItems : page === 'Recent' ? recentItems : page === 'Search' && deepResults !== null ? deepResults : entries;
  const visible = useMemo(() => {
    const data = source.filter(item => (hidden || !item.name.startsWith('.')) && item.name.toLowerCase().includes(query.trim().toLowerCase()) && (!category || kindOf(item) === category));
    if (page !== 'Recent' || sort !== 'name') data.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || (sort === 'modified' ? (b.modified ?? 0) - (a.modified ?? 0) : sort === 'size' ? b.size - a.size : a.name.localeCompare(b.name)));
    return data;
  }, [source, hidden, query, category, sort, page]);
  const displayedPath = directory === store?.root ? 'My files' : decodeURIComponent(directory.split('/').filter(Boolean).pop() ?? 'My files');
  const fileCount = entries.length; const bytes = entries.filter(x => !x.isDirectory).reduce((sum, x) => sum + x.size, 0);
  const overviewCategories: { kind: FileKind; label: string }[] = [{ kind: 'Document', label: 'Documents' }, { kind: 'Image', label: 'Images' }, { kind: 'Video', label: 'Videos' }, { kind: 'Audio', label: 'Audio' }];

  const list = () => <View style={{ flex: 1 }}>
    <View style={s.listHeading}><View style={{ flex: 1 }}><Text style={s.eyebrow}>{page === 'Files' ? 'YOUR WORKSPACE' : page === 'Search' ? 'CURRENT FOLDER' : 'YOUR COLLECTION'}</Text><Text style={s.pageTitle}>{page === 'Files' ? displayedPath : page}</Text><Text style={s.pageCaption}>{visible.length} {visible.length === 1 ? 'item' : 'items'}{category ? ` · ${category}` : ''}</Text></View>{page === 'Files' ? <Pressable disabled={!store || busy} onPress={() => askName('folder')} style={s.addButton} accessibilityLabel="Create folder"><Ionicons name="add" size={23} color="#fff"/></Pressable> : null}</View>
    {page === 'Files' && (historyIndex > 0 || historyIndex < history.length - 1) ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {historyIndex > 0 ? <Pressable style={s.back} onPress={() => { setHistoryIndex(historyIndex - 1); setDirectory(history[historyIndex - 1]); setSelected([]); }}><Ionicons name="arrow-back" size={16} color={colors.primary}/><Text style={s.backText}>Back</Text></Pressable> : null}
      {historyIndex < history.length - 1 ? <Pressable style={s.back} onPress={() => { setHistoryIndex(historyIndex + 1); setDirectory(history[historyIndex + 1]); setSelected([]); }}><Text style={s.backText}>Forward</Text><Ionicons name="arrow-forward" size={16} color={colors.primary}/></Pressable> : null}
    </View> : null}
    {category ? <Pressable style={s.back} onPress={() => setCategory(null)}><Ionicons name="close-circle-outline" size={16} color={colors.primary}/><Text style={s.backText}>Clear {category} filter</Text></Pressable> : null}
    {page === 'Search' || page === 'Favorites' || page === 'Recent' ? <View style={[s.searchBox, { marginHorizontal: 20, marginTop: 12 }]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={query} onChangeText={value => { searchAbort.current?.abort(); setSearching(false); setDeepResults(null); setSearchNote(''); setQuery(value); }} placeholder={page === 'Search' ? 'Search this folder' : 'Filter saved files'} placeholderTextColor={colors.muted} style={s.searchInput}/></View> : null}
    {page === 'Search' ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 8, gap: 8 }}><Text style={[s.searchNote, { flex: 1, marginHorizontal: 0, marginTop: 0 }]}>{searchNote || 'Filter this folder, or search its subfolders.'}</Text>{searching ? <Pressable onPress={() => { searchAbort.current?.abort(); setSearching(false); setSearchNote('Search stopped; results may be incomplete.'); }}><Text style={s.toolLink}>Stop</Text></Pressable> : <Pressable onPress={startDeepSearch} disabled={!query.trim() || !store}><Text style={[s.toolLink, !query.trim() && { color: colors.muted }]}>Search subfolders</Text></Pressable>}</View> : null}
    <View style={s.toolbar}>
      {selected.length ? <><Text style={s.toolbarText}>{selected.length} selected</Text><Pressable onPress={() => stage(selected, false)}><Text style={s.toolLink}>Copy</Text></Pressable><Pressable onPress={() => stage(selected, true)}><Text style={s.toolLink}>Move</Text></Pressable><Pressable onPress={() => remove(source.filter(x => selected.includes(x.uri)))}><Text style={[s.toolLink, { color: colors.red }]}>Delete</Text></Pressable><Pressable onPress={() => setSelected([])}><Ionicons name="close" size={20} color={colors.secondary}/></Pressable></> : <><Pressable onPress={() => setSelected(visible.map(x => x.uri))}><Text style={s.toolLink}>Select all</Text></Pressable>{page === 'Files' ? <><Pressable disabled={!store || busy} onPress={() => askName('file')} accessibilityLabel="Create file"><Ionicons name="document-text-outline" size={19} color={colors.primary}/></Pressable><Pressable disabled={!store || busy} onPress={importFiles} accessibilityLabel="Import files"><Ionicons name="cloud-upload-outline" size={19} color={colors.primary}/></Pressable></> : null}{clipboard && page === 'Files' ? <Pressable onPress={paste}><Text style={s.toolLink}>Paste ({clipboard.paths.length})</Text></Pressable> : null}<View style={{ flex: 1 }}/><Pressable onPress={() => setSort(sort === 'name' ? 'modified' : sort === 'modified' ? 'size' : 'name')}><Text style={s.sortText}>Sort: {sort}  <Ionicons name="swap-vertical" size={14}/></Text></Pressable></>}
    </View>
    {busy ? <ActivityIndicator color={colors.primary} style={{ margin: 8 }}/> : null}
    {loading ? <View style={s.center}><ActivityIndicator color={colors.primary}/><Text style={s.emptyCaption}>Loading your files…</Text></View> : error ? <View style={s.center}><Ionicons name="warning-outline" size={36} color={colors.orange}/><Text style={s.emptyTitle}>Couldn’t load this folder</Text><Text style={s.emptyCaption}>{error}</Text><Pressable onPress={refresh}><Text style={s.toolLink}>Try again</Text></Pressable></View> : <FlatList data={visible} keyExtractor={item => item.uri} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, flexGrow: 1 }} renderItem={({ item }) => <FileRow entry={item} onPress={() => void open(item)} onMore={() => setActive(item)} onSelect={() => toggleSelection(item.uri)} selected={selected.includes(item.uri)}/>} ListEmptyComponent={<View style={s.center}><IconBox icon="folder-open-outline" size={58} background="#F1F5F9" color={colors.muted}/><Text style={s.emptyTitle}>Nothing here yet</Text><Text style={s.emptyCaption}>{page === 'Favorites' ? 'Star a file or folder to find it here.' : page === 'Recent' ? 'Files you open will appear here.' : 'Import a file or create a folder to get started.'}</Text>{page === 'Files' ? <Pressable onPress={importFiles}><Text style={s.toolLink}>Import files</Text></Pressable> : null}</View>}/>}
  </View>;
  const home = () => <ScrollView contentContainerStyle={s.homeContent}>
    <View style={s.heroHeading}><View style={{ flex: 1 }}><Text style={s.eyebrow}>YOUR WORKSPACE</Text><Text style={s.heroTitle}>Everything in{wide ? ' ' : '\n'}its place.</Text><Text style={s.heroCaption}>A little more space to focus on what matters.</Text></View><View style={s.sparkle}><Ionicons name="sparkles" color={colors.primary} size={24}/></View></View>
    <View style={[s.overview, wide && { maxWidth: 720 }]}><View style={s.overviewTop}><View style={s.overviewIcon}><Ionicons name="folder-open-outline" size={21} color="#D5D9FF"/></View><Text style={s.overviewLabel}>CURRENT FOLDER</Text></View><View><Text style={s.overviewNumber}>{fileCount} {fileCount === 1 ? 'item' : 'items'}</Text><Text style={s.overviewSub}>{formatBytes(bytes)} in direct files · folders excluded</Text></View><View style={s.overviewFooter}><Text numberOfLines={1} style={s.overviewPath}>{displayedPath}</Text><Pressable onPress={() => changePage('Files')}><Text style={s.overviewLink}>Browse  →</Text></Pressable></View></View>
    <SectionTitle title="Device storage" subtitle="Internal storage reported by the operating system"/>
    <Card style={{ padding: 16 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><IconBox icon="hardware-chip-outline" size={42}/><View style={{ flex: 1 }}><Text style={s.fileTitle}>{storage ? `${formatBytes(storage.free)} available` : 'Storage information unavailable'}</Text><Text style={s.settingSub}>{storage ? `${formatBytes(storage.total - storage.free)} used of ${formatBytes(storage.total)}` : 'The device did not report storage capacity.'}</Text></View></View>{storage ? <View style={s.storageBar}><View style={[s.storageFill, { width: `${Math.max(0, Math.min(100, (storage.total - storage.free) / storage.total * 100))}%` }]}/></View> : null}</Card>
    <SectionTitle title="Quick actions" subtitle="Pick up where you left off"/>
    <View style={s.quickGrid}>{[
      { icon: 'cloud-upload-outline' as IconName, title: 'Import files', onPress: importFiles },
      { icon: 'folder-open-outline' as IconName, title: 'Browse files', onPress: () => changePage('Files') },
      { icon: 'add-circle-outline' as IconName, title: 'New folder', onPress: () => askName('folder') },
      { icon: 'phone-portrait-outline' as IconName, title: 'Device folders', onPress: () => Platform.OS === 'android' ? setDeviceBrowser(true) : Alert.alert('Unavailable', 'Selected-folder browsing is currently available on Android only.') },
    ].map(item => <Pressable key={item.title} style={s.quick} onPress={item.onPress}><IconBox icon={item.icon} size={46}/><Text style={s.quickLabel}>{item.title}</Text></Pressable>)}</View>
    <SectionTitle title="Explore your files" subtitle="Categories in the current folder" action="Browse all" onPress={() => changePage('Files')}/>
    <View style={s.categories}>{overviewCategories.map(({ kind, label }) => { const c = kindStyles[kind]; const count = entries.filter(e => kindOf(e) === kind).length; return <Pressable key={kind} style={s.categoryCard} onPress={() => { setCategory(kind); setQuery(''); setPage('Files'); }}><IconBox {...c} size={42}/><View style={{ flex: 1, marginLeft: 10 }}><Text style={s.categoryTitle}>{label}</Text><Text style={s.categorySub}>{count} {count === 1 ? 'item' : 'items'}</Text></View><Ionicons name="chevron-forward" size={16} color="#C2CAD7"/></Pressable>; })}</View>
    <SectionTitle title="Recently opened" subtitle="Your latest activity" action="View all" onPress={() => changePage('Recent')}/>
    <Card>{recentItems.length ? recentItems.slice(0, 3).map(item => <FileRow key={item.uri} entry={item} onPress={() => void open(item)} onMore={() => setActive(item)}/>) : <View style={s.inlineEmpty}><IconBox icon="time-outline" size={42} color={colors.muted} background="#F1F5F9"/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.emptyRowTitle}>No recent files yet</Text><Text style={s.emptyRowSub}>Open a file and it will appear here.</Text></View></View>}</Card>
    <SectionTitle title="Favorites" subtitle="Keep important things close" action="View all" onPress={() => changePage('Favorites')}/>
    <Card>{favoriteItems.length ? favoriteItems.slice(0, 3).map(item => <FileRow key={item.uri} entry={item} onPress={() => void open(item)} onMore={() => setActive(item)}/>) : <View style={s.inlineEmpty}><IconBox icon="star-outline" size={42} color={colors.muted} background="#F1F5F9"/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.emptyRowTitle}>Nothing starred yet</Text><Text style={s.emptyRowSub}>Add a file or folder to favorites.</Text></View></View>}</Card>
    <View style={s.privacy}><Ionicons name="shield-checkmark-outline" size={18} color={colors.primary}/><Text style={s.privacyText}>Private by design. Your files stay on this device.</Text></View>
  </ScrollView>;
  const more = () => <ScrollView contentContainerStyle={s.homeContent}><Text style={s.eyebrow}>FILEOS</Text><Text style={s.pageTitle}>More & settings</Text><Text style={[s.pageCaption, { marginBottom: 24 }]}>Manage your workspace preferences</Text>
    <Card>
      <Pressable style={s.settingRow} onPress={() => { const next = !hidden; setHidden(next); void AsyncStorage.setItem(HIDDEN, String(next)).catch(() => Alert.alert('Could not save preference')); }}><IconBox icon={hidden ? 'eye-outline' : 'eye-off-outline'} size={40}/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.fileTitle}>Show hidden files</Text><Text style={s.settingSub}>Dot-prefixed names · {hidden ? 'On' : 'Off'}</Text></View><Ionicons name={hidden ? 'toggle' : 'toggle-outline'} color={hidden ? colors.primary : colors.muted} size={30}/></Pressable>
      <Pressable style={s.settingRow} onPress={() => Platform.OS === 'android' ? setDeviceBrowser(true) : Alert.alert('Unavailable', 'Selected-folder browsing is currently available on Android only.')}><IconBox icon="phone-portrait-outline" size={40}/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.fileTitle}>Device folders</Text><Text style={s.settingSub}>Browse a folder you select · Android</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19}/></Pressable>
      <Pressable style={s.settingRow} onPress={() => changePage('Recent')}><IconBox icon="time-outline" size={40}/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.fileTitle}>Recent files</Text><Text style={s.settingSub}>Files opened in FileOS</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19}/></Pressable>
      <Pressable style={s.settingRow} onPress={refresh}><IconBox icon="refresh-outline" size={40}/><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.fileTitle}>Refresh folder</Text><Text style={s.settingSub}>Reload the current workspace</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={19}/></Pressable>
    </Card>
    <SectionTitle title="About your storage" subtitle="What is available today"/>
    <Card style={{ padding: 18 }}><Text style={s.aboutText}>Manage app-owned files or browse a user-selected Android folder read-only. Importing makes a copy. Uninstalling the app may remove app-owned files; keep backups elsewhere.</Text><Text style={[s.aboutText, { marginTop: 12 }]}>Unrestricted device-wide browsing, editing selected folders, recycle bin, vault, archive tools, background media features and cloud services are not yet available.</Text></Card>
  </ScrollView>;

  const nav = (side = false) => <View style={side ? s.sideNav : s.bottomNav}>{navigation.map(item => <Pressable key={item.page} onPress={() => changePage(item.page)} style={[side ? s.sideItem : s.navItem, page === item.page && side && { backgroundColor: colors.soft }]}><Ionicons name={page === item.page ? item.active : item.icon} size={21} color={page === item.page ? colors.primary : colors.muted}/><Text style={[side ? s.sideText : s.navText, page === item.page && { color: colors.primary, fontWeight: '700' }]}>{item.page === 'Files' ? 'Browse' : item.page}</Text></Pressable>)}</View>;
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>{deviceBrowser && store ? <StorageBrowser store={store} hidden={hidden} onClose={() => setDeviceBrowser(false)} onImported={() => void refresh()}/> : preview && store ? <Preview item={preview} store={store} close={() => setPreview(null)}/> : <View style={s.shell}>
    {wide ? <View style={s.sidebar}><View style={s.brand}><View style={s.logo}><Ionicons name="grid" size={19} color="#fff"/></View><Text style={s.brandText}>fileos</Text></View><Text style={s.sidebarLabel}>WORKSPACE</Text>{nav(true)}<View style={s.sidebarBottom}><Ionicons name="shield-checkmark-outline" size={19} color={colors.primary}/><Text style={s.sidebarPrivacy}>Private by design</Text></View></View> : null}
    <View style={s.main}><View style={s.header}><View style={s.headerTitle}>{!wide ? <View style={s.logo}><Ionicons name="grid" size={17} color="#fff"/></View> : null}<Text style={s.headerText}>{page === 'Home' ? 'Overview' : page === 'Files' ? 'Browse' : page}</Text></View><View style={s.headerActions}><Pressable accessibilityLabel="Search" onPress={() => changePage('Search')} style={s.headerIcon}><Ionicons name="search-outline" size={21} color={colors.secondary}/></Pressable><Pressable accessibilityLabel="Settings" onPress={() => changePage('More')} style={s.avatar}><Ionicons name="options-outline" size={18} color={colors.primary}/></Pressable></View></View>
      {page === 'Home' ? (error ? <View style={s.center}><Ionicons name="phone-portrait-outline" size={44} color={colors.muted}/><Text style={s.emptyTitle}>Open FileOS on a device</Text><Text style={s.emptyCaption}>{error}</Text></View> : home()) : page === 'More' ? more() : list()}
      {!wide ? nav() : null}
    </View>
  </View>}
  <Modal visible={!!nameAction} transparent animationType="fade" onRequestClose={() => setNameAction(null)}><View style={s.modalBackdrop}><View style={s.dialog}><Text style={s.dialogTitle}>{nameAction?.type === 'rename' ? 'Rename item' : nameAction?.type === 'folder' ? 'New folder' : 'New file'}</Text><Text style={s.dialogCaption}>Choose a name for this item.</Text><TextInput autoFocus value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={s.nameInput} onSubmitEditing={() => void saveName()}/><View style={s.dialogButtons}><Pressable onPress={() => setNameAction(null)} style={s.dialogCancel}><Text style={s.toolLink}>Cancel</Text></Pressable><Pressable onPress={() => void saveName()} style={s.dialogSave}><Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text></Pressable></View></View></View></Modal>
  <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}><Pressable style={s.sheetBackdrop} onPress={() => setActive(null)}><Pressable style={s.sheet} onPress={event => event.stopPropagation()}><View style={s.grabber}/><Text style={s.sheetTitle} numberOfLines={1}>{active?.name}</Text><Text style={s.sheetCaption}>{active ? `${kindOf(active)}${active.isDirectory ? '' : ` · ${formatBytes(active.size)}`}` : ''}</Text>
    {active ? <>{[
      { icon: 'open-outline' as IconName, label: 'Open', action: () => { const item = active; setActive(null); void open(item); } },
      { icon: 'star-outline' as IconName, label: favorites.includes(active.uri) ? 'Remove from favorites' : 'Add to favorites', action: () => void toggleFavorite(active) },
      { icon: 'copy-outline' as IconName, label: 'Copy', action: () => stage([active.uri], false) },
      { icon: 'documents-outline' as IconName, label: 'Duplicate', action: () => { const item = active; if (store) void run(async () => { await store.duplicate(item); }, 'Duplicated successfully.'); } },
      { icon: 'cut-outline' as IconName, label: 'Move', action: () => stage([active.uri], true) },
      { icon: 'pencil-outline' as IconName, label: 'Rename', action: () => askName('rename', active) },
      { icon: 'trash-outline' as IconName, label: 'Delete permanently', action: () => { const item = active; setActive(null); remove([item]); } },
    ].map(item => <Pressable key={item.label} onPress={item.action} style={s.sheetRow}><Ionicons name={item.icon} size={20} color={item.label.startsWith('Delete') ? colors.red : colors.secondary}/><Text style={[s.sheetRowText, item.label.startsWith('Delete') && { color: colors.red }]}>{item.label}</Text></Pressable>)}</> : null}
  </Pressable></Pressable></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }, shell: { flex: 1, flexDirection: 'row' }, main: { flex: 1, minWidth: 0 },
  header: { height: 66, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 11 }, headerText: { color: colors.ink, fontSize: 15, fontWeight: '700' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 13 }, headerIcon: { padding: 5 }, logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' },
  sidebar: { width: 220, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 16 }, brand: { height: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 }, brandText: { fontSize: 23, fontWeight: '800', color: colors.ink, letterSpacing: -1 }, sidebarLabel: { marginTop: 20, marginBottom: 12, marginLeft: 10, fontSize: 10, letterSpacing: 1.2, fontWeight: '800', color: colors.muted }, sideNav: { gap: 3 }, sideItem: { height: 45, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, sideText: { fontSize: 13, color: colors.secondary, fontWeight: '600' }, sidebarBottom: { marginTop: 'auto', marginBottom: 24, padding: 14, borderRadius: 12, backgroundColor: '#F7F8FC', flexDirection: 'row', gap: 8, alignItems: 'center' }, sidebarPrivacy: { color: colors.secondary, fontSize: 12, fontWeight: '600' },
  bottomNav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, height: 67, paddingHorizontal: 6 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }, navText: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  homeContent: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 42, maxWidth: 1000, width: '100%', alignSelf: 'center' }, heroHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 23 }, eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }, heroTitle: { color: colors.ink, fontSize: 29, fontWeight: '800', letterSpacing: -1.1, marginTop: 8, lineHeight: 35 }, heroCaption: { color: colors.secondary, fontSize: 12, lineHeight: 19, marginTop: 7 }, sparkle: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#EEF0FF' },
  overview: { backgroundColor: '#272D55', borderRadius: 17, padding: 20, minHeight: 186, justifyContent: 'space-between' }, overviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, overviewIcon: { backgroundColor: 'rgba(255,255,255,0.10)', width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, overviewLabel: { color: '#ADB6DA', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, overviewNumber: { color: '#fff', fontSize: 27, fontWeight: '800', letterSpacing: -.8 }, overviewSub: { color: '#BEC6E3', fontSize: 11, marginTop: 4 }, overviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, overviewPath: { color: '#A5B0D4', fontSize: 11, flex: 1 }, overviewLink: { color: '#E4E7FF', fontSize: 11, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, quick: { flex: 1, alignItems: 'center', paddingVertical: 15, backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: colors.border }, quickLabel: { color: colors.secondary, fontSize: 10, fontWeight: '700', marginTop: 9, textAlign: 'center' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, categoryCard: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, categoryTitle: { color: colors.ink, fontWeight: '700', fontSize: 12 }, categorySub: { color: colors.muted, fontSize: 11, marginTop: 5 }, inlineEmpty: { padding: 16, flexDirection: 'row', alignItems: 'center' }, emptyRowTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, emptyRowSub: { color: colors.secondary, fontSize: 11, marginTop: 5 }, privacy: { marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }, privacyText: { color: colors.secondary, fontSize: 11 },
  listHeading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 25 }, pageTitle: { color: colors.ink, fontWeight: '800', fontSize: 25, letterSpacing: -.7, marginTop: 7 }, pageCaption: { color: colors.secondary, fontSize: 12, marginTop: 5 }, addButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, back: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 14, gap: 6 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '600' }, toolbar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 }, toolbarText: { color: colors.ink, fontWeight: '700', fontSize: 12 }, toolLink: { color: colors.primary, fontWeight: '700', fontSize: 12 }, sortText: { color: colors.secondary, fontSize: 12 }, searchBox: { backgroundColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, paddingHorizontal: 14, height: 44 }, searchInput: { flex: 1, color: colors.ink, height: 44, fontSize: 13 }, searchNote: { color: colors.secondary, fontSize: 11, marginHorizontal: 22, marginTop: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26, minHeight: 220 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 15 }, emptyCaption: { color: colors.secondary, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7, marginBottom: 15 },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, fileTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, settingSub: { color: colors.secondary, fontSize: 11, marginTop: 5 }, aboutText: { color: colors.secondary, fontSize: 12, lineHeight: 20 },
  storageBar: { marginTop: 14, height: 6, backgroundColor: '#EEF2FF', borderRadius: 6, overflow: 'hidden' }, storageFill: { height: 6, backgroundColor: colors.primary, borderRadius: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.45)' }, dialog: { backgroundColor: '#fff', padding: 22, borderRadius: 18, maxWidth: 440, width: '100%', alignSelf: 'center' }, dialogTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' }, dialogCaption: { color: colors.secondary, fontSize: 12, marginTop: 6 }, nameInput: { marginTop: 18, height: 48, backgroundColor: '#F1F5F9', paddingHorizontal: 14, borderRadius: 10, color: colors.ink }, dialogButtons: { marginTop: 20, flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }, dialogCancel: { padding: 12 }, dialogSave: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#fff', paddingHorizontal: 22, paddingBottom: 32, borderTopLeftRadius: 22, borderTopRightRadius: 22 }, grabber: { width: 38, height: 4, borderRadius: 4, alignSelf: 'center', backgroundColor: '#CBD5E1', marginTop: 10, marginBottom: 18 }, sheetTitle: { fontWeight: '800', fontSize: 17, color: colors.ink }, sheetCaption: { color: colors.secondary, fontSize: 12, marginTop: 5, marginBottom: 12 }, sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 13 }, sheetRowText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
});
