import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { FileEntry } from './models';
import { prepareTreeEntries } from './treeEntries';

interface TreeNativeModule {
  list(tree: string, parent: string): Promise<FileEntry[]>;
  readText(tree: string, document: string): Promise<string>;
}
const native: TreeNativeModule | undefined = NativeModules.FileOSStorageTree;

/** Android SAF grants are held by the OS; content URIs are never treated as paths. */
export async function chooseTree(): Promise<string | null> {
  if (Platform.OS !== 'android' || !native) throw new Error('Selected-folder browsing requires the FileOS Android app.');
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  return result.granted ? result.directoryUri : null;
}
export async function listTree(tree: string, directory: string, showHidden: boolean): Promise<FileEntry[]> {
  if (!native || Platform.OS !== 'android') throw new Error('Selected-folder browsing is unavailable on this device.');
  const entries = await native.list(tree, directory);
  return prepareTreeEntries(entries, showHidden);
}
export async function readTreeText(tree: string, uri: string): Promise<string> {
  if (!native || Platform.OS !== 'android') throw new Error('Selected-folder browsing is unavailable on this device.');
  return native.readText(tree, uri);
}
