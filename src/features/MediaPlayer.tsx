import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../components/design';


function clock(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const status = useEvent(player, 'statusChange', { status: player.status });
  return <View style={styles.videoContainer}>
    <VideoView player={player} nativeControls contentFit="contain" style={styles.video}/>
    <Text style={styles.note}>{status.status === 'error' ? 'Unable to play this video. The file may be damaged or its codec may not be supported on this device.' : 'Playback and available controls depend on device codecs.'}</Text>
  </View>;
}

export function AudioPlayer({ uri, name }: { uri: string; name: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(1);
  const seek = (seconds: number) => { void player.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime + seconds))); };
  return <View style={styles.audioContainer}>
    <View style={styles.art}><Ionicons name="musical-notes" size={52} color={colors.primary}/></View>
    <Text numberOfLines={2} style={styles.title}>{name}</Text>
    <Text style={styles.subtitle}>Audio · on this device</Text>
    <View style={styles.track}><View style={[styles.trackFill, { width: `${status.duration > 0 ? Math.min(100, Math.max(0, status.currentTime / status.duration * 100)) : 0}%` }]}/></View>
    <View style={styles.times}><Text style={styles.time}>{clock(status.currentTime)}</Text><Text style={styles.time}>{clock(status.duration)}</Text></View>
    <View style={styles.controls}>
      <Pressable accessibilityLabel="Back 10 seconds" onPress={() => seek(-10)}><Ionicons name="play-back" color={colors.ink} size={25}/></Pressable>
      <Pressable accessibilityLabel={status.playing ? 'Pause' : 'Play'} onPress={() => status.playing ? player.pause() : player.play()} style={styles.play}><Ionicons name={status.playing ? 'pause' : 'play'} color="#fff" size={26}/></Pressable>
      <Pressable accessibilityLabel="Forward 10 seconds" onPress={() => seek(10)}><Ionicons name="play-forward" color={colors.ink} size={25}/></Pressable>
    </View>
    <Pressable onPress={() => { const rates = [0.75, 1, 1.25, 1.5, 2]; const next = rates[(rates.indexOf(rate) + 1) % rates.length]; player.setPlaybackRate(next); setRate(next); }} style={styles.rate}><Text style={styles.rateText}>{rate}× speed</Text></Pressable>
    <Text style={[styles.note, { textAlign: 'center', marginTop: 24 }]}>{!status.isLoaded ? 'Loading audio. If it does not play, the format or codec may not be supported.' : 'Playback depends on the device codec. Audio stops when this screen closes.'}</Text>
  </View>;
}
const styles = StyleSheet.create({ videoContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center' }, video: { width: '100%', flex: 1 }, note: { color: '#94A3B8', fontSize: 11, lineHeight: 17, padding: 14 }, audioContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#F8FAFC' }, art: { width: 150, height: 150, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', marginBottom: 25 }, title: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' }, subtitle: { marginTop: 6, fontSize: 12, color: colors.secondary }, track: { width: '100%', height: 5, borderRadius: 4, backgroundColor: '#E2E8F0', marginTop: 32, overflow: 'hidden' }, trackFill: { height: '100%', backgroundColor: colors.primary }, times: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, time: { color: colors.secondary, fontSize: 11 }, controls: { flexDirection: 'row', alignItems: 'center', gap: 36, marginTop: 22 }, play: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, rate: { marginTop: 24, backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18 }, rateText: { fontSize: 12, color: colors.primary, fontWeight: '700' } });
