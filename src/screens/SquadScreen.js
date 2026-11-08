import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ensureSquad,
  getSquad,
  setPlayerPlaying,
  resetSquadToFirst11,
} from '../database/db';

const SQUAD_SIZE = 11;

export default function SquadScreen({ route }) {
  const { matchId, team1Id, team2Id, team1Name, team2Name } = route.params;

  const [activeTeamId, setActiveTeamId] = useState(team1Id);
  const [players, setPlayers] = useState([]);

  const load = useCallback(async (teamId) => {
    try {
      // Auto-select the first 11 players the first time this team is opened
      await ensureSquad(matchId, teamId);
      setPlayers(await getSquad(matchId, teamId));
    } catch (error) {
      console.log('Squad load error:', error);
      Alert.alert('Error', 'Unable to load the squad.');
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      load(activeTeamId);
    }, [load, activeTeamId])
  );

  const playingCount = players.filter(p => p.is_playing === 1).length;

  const toggle = async (player) => {
    try {
      if (player.is_playing === 1) {
        await setPlayerPlaying(matchId, activeTeamId, player.player_id, false);
      } else {
        if (playingCount >= SQUAD_SIZE) {
          Alert.alert(
            'Playing XI is full',
            'Move a playing player to the bench first, then activate this player.'
          );
          return;
        }
        await setPlayerPlaying(matchId, activeTeamId, player.player_id, true);
      }
      setPlayers(await getSquad(matchId, activeTeamId));
    } catch (error) {
      console.log('Squad toggle error:', error);
      Alert.alert('Error', 'Unable to update the squad.');
    }
  };

  const autoSelect = async () => {
    await resetSquadToFirst11(matchId, activeTeamId);
    setPlayers(await getSquad(matchId, activeTeamId));
  };

  const renderPlayer = ({ item }) => {
    const playing = item.is_playing === 1;
    return (
      <TouchableOpacity
        style={[styles.row, playing ? styles.rowPlaying : styles.rowBench]}
        onPress={() => toggle(item)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.player_name}</Text>
          <Text style={styles.meta}>
            {item.role || 'Player'}
            {item.jersey_number != null ? `  •  #${item.jersey_number}` : ''}
          </Text>
        </View>
        <Text style={[styles.badge, playing ? styles.badgePlaying : styles.badgeBench]}>
          {playing ? 'PLAYING' : 'BENCH'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {[
          { id: team1Id, name: team1Name },
          { id: team2Id, name: team2Name },
        ].map(team => (
          <TouchableOpacity
            key={team.id}
            style={[styles.tab, activeTeamId === team.id && styles.tabActive]}
            onPress={() => setActiveTeamId(team.id)}
          >
            <Text style={styles.tabText} numberOfLines={1}>{team.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.count}>
        Playing: {playingCount} / {SQUAD_SIZE}   •   Bench: {players.length - playingCount}
      </Text>
      <Text style={styles.hint}>
        Tap a player to move them between Playing and Bench. Bench players cannot
        bat, bowl or field until they are made active.
      </Text>

      <TouchableOpacity style={styles.autoButton} onPress={autoSelect}>
        <Text style={styles.autoText}>Auto-select first 11</Text>
      </TouchableOpacity>

      <FlatList
        data={players}
        keyExtractor={item => String(item.player_id)}
        renderItem={renderPlayer}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={
          <Text style={styles.hint}>This team has no players. Add players first.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F16', padding: 16 },
  tabs: { flexDirection: 'row', marginBottom: 14 },
  tab: {
    flex: 1,
    backgroundColor: '#183528',
    padding: 12,
    alignItems: 'center',
    borderRadius: 10,
    marginRight: 8,
  },
  tabActive: { backgroundColor: '#16A34A' },
  tabText: { color: '#FFFFFF', fontWeight: 'bold' },
  count: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  hint: { color: '#94A3B8', fontSize: 12, marginTop: 6, marginBottom: 10 },
  autoButton: {
    backgroundColor: '#2563EB',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  autoText: { color: '#FFFFFF', fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  rowPlaying: { backgroundColor: '#183528' },
  rowBench: { backgroundColor: '#111827', opacity: 0.8 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  meta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  badge: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  badgePlaying: { backgroundColor: '#16A34A', color: '#FFFFFF' },
  badgeBench: { backgroundColor: '#475569', color: '#E2E8F0' },
});
