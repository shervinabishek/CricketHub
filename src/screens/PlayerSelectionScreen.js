
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { getPlayingPlayers } from '../database/db';

export default function PlayerSelectionScreen({ route, navigation }) {
  const {
    mode,
    matchId,
    teamId,
    excludedPlayerIds = [],
    currentNonStrikerId,
    previousBowlerId,
  } = route.params || {};

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const isBatsman = mode === 'batsman';

  useEffect(() => {
    loadPlayers();
  }, [teamId]);

  const loadPlayers = async () => {
    try {
      setLoading(true);

      // Only active (playing XI) players can be selected
      const result = await getPlayingPlayers(matchId, teamId);

      let availablePlayers = result;

      if (isBatsman) {
        const excludedIds = [
          ...excludedPlayerIds,
          currentNonStrikerId,
        ]
          .filter(Boolean)
          .map(Number);

        availablePlayers = result.filter(
          player => !excludedIds.includes(Number(player.player_id))
        );
      } else {
        availablePlayers = result.filter(
          player => Number(player.player_id) !== Number(previousBowlerId)
        );
      }

      setPlayers(availablePlayers);
    } catch (error) {
      console.log('Player loading error:', error);
      Alert.alert('Error', 'Unable to load players.');
    } finally {
      setLoading(false);
    }
  };

  const selectPlayer = (player) => {
    const state = navigation.getState();
    const previousRoute = state.routes[state.index - 1];

    if (!previousRoute) {
      Alert.alert('Error', 'Unable to return to the innings screen.');
      return;
    }

    navigation.dispatch({
      ...CommonActions.setParams({
        selectedPlayerId: player.player_id,
        selectionMode: mode,
      }),
      source: previousRoute.key,
    });

    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name={isBatsman ? 'person-outline' : 'baseball-outline'}
          size={38}
          color="#16A34A"
        />

        <Text style={styles.title}>
          {isBatsman ? 'Select New Batsman' : 'Select Next Bowler'}
        </Text>

        <Text style={styles.subtitle}>
          {isBatsman
            ? 'Choose a player to come in and bat.'
            : 'Choose a bowler for the next over.'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#16A34A"
          style={styles.loader}
        />
      ) : players.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={45} color="#9CA3AF" />
          <Text style={styles.emptyText}>No available players.</Text>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => String(item.player_id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.playerCard}
              onPress={() => selectPlayer(item)}
              activeOpacity={0.75}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.player_name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>

              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>
                  {item.player_name}
                </Text>
                <Text style={styles.playerRole}>
                  {item.role || 'Player'}
                  {item.jersey_number
                    ? `  •  Jersey ${item.jersey_number}`
                    : ''}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={22}
                color="#16A34A"
              />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7F4',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#14532D',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 7,
    textAlign: 'center',
  },
  loader: {
    marginTop: 50,
  },
  list: {
    padding: 15,
    paddingBottom: 30,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#15803D',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 13,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  playerRole: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 70,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 12,
  },
});

