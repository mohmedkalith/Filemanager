import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { FileStore, type FileSystemAdapter } from './fileStore';

const adapter: FileSystemAdapter = {
  readDirectory: FileSystem.readDirectoryAsync,
  info: FileSystem.getInfoAsync,
  makeDirectory: uri => FileSystem.makeDirectoryAsync(uri),
  write: (uri, contents) => FileSystem.writeAsStringAsync(uri, contents),
  copy: (from, to) => FileSystem.copyAsync({ from, to }),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  delete: uri => FileSystem.deleteAsync(uri),
  read: uri => FileSystem.readAsStringAsync(uri),
};

export function createNativeStore(): FileStore {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) throw new Error('Local file storage is available in the Android or iOS app, not the web preview.');
  return new FileStore(adapter, FileSystem.documentDirectory);
}
