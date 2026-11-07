import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getDatabase,
  loadSampleData,
  resetAllData,
} from '../database/db';

export default function SettingsScreen() {
  const [counts, setCounts] = useState({ teams: 0, players: 0, matches: 0 });

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const c = await db.getFirstAsync(`
        SELECT
          (SELECT COUNT(*) FROM teams) AS teams,
          (SELECT COUNT(*) FROM players) AS players,
          (SELECT COUNT(*) FROM matches) AS matches
      `);
      setCounts(c);
    } catch (error) {
      console.log('Settings error:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const addSamples = async () => {
    try {
      await loadSampleData();
      await refresh();
      Alert.alert('Done', 'Sample teams, players and a match were added.');
    } catch (error) {
      if (error.message === 'EXISTING_DATA') {
        Alert.alert(
          'Data already exists',
          'Sample data can only be loaded when there are no teams. Reset all data first.'
        );
      } else {
        console.log(error);
        Alert.alert('Error', 'Unable to load sample data.');
      }
    }
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset all data',
      'This permanently deletes every team, player, match and score. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetAllData();
              await refresh();
              Alert.alert('Done', 'All data has been deleted.');
            } catch (error) {
              console.log(error);
              Alert.alert('Error', 'Unable to reset data.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Manage your CricketHub data</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stored data</Text>
        <Text style={styles.row}>Teams: {counts.teams}</Text>
        <Text style={styles.row}>Players: {counts.players}</Text>
        <Text style={styles.row}>Matches: {counts.matches}</Text>
      </View>

      <TouchableOpacity style={styles.primary} onPress={addSamples}>
        <Text style={styles.buttonText}>Load sample data</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.danger} onPress={confirmReset}>
        <Text style={styles.buttonText}>Reset all data</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>About</Text>
        <Text style={styles.row}>CricketHub 1.0.0</Text>
        <Text style={styles.row}>
          All data is stored offline on this device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    padding: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 35,
  },
  subtitle: {
    color: '#94A3B8',
    marginTop: 5,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#183528',
    padding: 18,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#22C55E',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    color: '#CBD5E1',
    marginTop: 4,
  },
  primary: {
    backgroundColor: '#16A34A',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  danger: {
    backgroundColor: '#DC2626',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
