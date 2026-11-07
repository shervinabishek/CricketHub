
import React, { useState, useCallback } from 'react';

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
} from 'react-native';

import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import {
  getDatabase,
  deletePlayerCascade,
  countPlayerEvents,
} from '../database/db';

const roles = [
  'Batsman',
  'Bowler',
  'All-rounder',
  'Wicketkeeper',
];

export default function PlayersScreen({ navigation }) {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);

  const [playerName, setPlayerName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [role, setRole] = useState('Batsman');
  const [teamId, setTeamId] = useState('');
  const [battingStyle, setBattingStyle] = useState('Right-hand');
  const [bowlingStyle, setBowlingStyle] = useState('');

  const loadData = async () => {
    try {
      const db = await getDatabase();

      const teamData = await db.getAllAsync(
        'SELECT * FROM teams ORDER BY team_name'
      );

      const playerData = await db.getAllAsync(`
        SELECT players.*, teams.team_name
        FROM players
        INNER JOIN teams
        ON players.team_id = teams.team_id
        ORDER BY players.player_name
      `);

      setTeams(teamData);
      setPlayers(playerData);
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Unable to load players');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const resetForm = () => {
    setEditingPlayer(null);
    setPlayerName('');
    setJerseyNumber('');
    setRole('Batsman');
    setTeamId('');
    setBattingStyle('Right-hand');
    setBowlingStyle('');
  };

  const openAddModal = () => {
    if (teams.length === 0) {
      Alert.alert(
        'No Teams Available',
        'Please create a team before adding players.'
      );
      return;
    }

    resetForm();
    setTeamId(String(teams[0].team_id));
    setModalVisible(true);
  };

  const openEditModal = (player) => {
    setEditingPlayer(player);
    setPlayerName(player.player_name);
    setJerseyNumber(
      player.jersey_number == null
        ? ''
        : String(player.jersey_number)
    );
    setRole(player.role);
    setTeamId(String(player.team_id));
    setBattingStyle(player.batting_style || 'Right-hand');
    setBowlingStyle(player.bowling_style || '');
    setModalVisible(true);
  };

  const savePlayer = async () => {
    if (!playerName.trim() || !teamId) {
      Alert.alert(
        'Required Fields',
        'Please enter a player name and select a team.'
      );
      return;
    }

    if (
      jerseyNumber.trim() &&
      (!/^\d+$/.test(jerseyNumber.trim()) ||
        Number(jerseyNumber) < 0 ||
        Number(jerseyNumber) > 999)
    ) {
      Alert.alert('Invalid Number', 'Enter a valid jersey number.');
      return;
    }

    try {
      const db = await getDatabase();

      const number = jerseyNumber.trim()
        ? Number(jerseyNumber)
        : null;

      if (editingPlayer) {
        await db.runAsync(
          `UPDATE players
           SET player_name = ?,
               jersey_number = ?,
               role = ?,
               team_id = ?,
               batting_style = ?,
               bowling_style = ?
           WHERE player_id = ?`,
          playerName.trim(),
          number,
          role,
          Number(teamId),
          battingStyle,
          bowlingStyle.trim(),
          editingPlayer.player_id
        );
      } else {
        await db.runAsync(
          `INSERT INTO players
           (player_name, jersey_number, role, team_id,
            batting_style, bowling_style)
           VALUES (?, ?, ?, ?, ?, ?)`,
          playerName.trim(),
          number,
          role,
          Number(teamId),
          battingStyle,
          bowlingStyle.trim()
        );
      }

      setModalVisible(false);
      resetForm();
      await loadData();

      Alert.alert(
        'Success',
        editingPlayer
          ? 'Player updated successfully'
          : 'Player added successfully'
      );
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Unable to save player');
    }
  };

  const deletePlayer = async (player) => {
    let events = 0;
    try {
      events = await countPlayerEvents(player.player_id);
    } catch (error) {
      console.log(error);
    }

    Alert.alert(
      'Delete Player',
      events > 0
        ? `Delete ${player.player_name}? They appear in ${events} recorded deliveries. Those deliveries will be removed and the match scores recalculated.`
        : `Delete ${player.player_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlayerCascade(player.player_id);
              await loadData();
            } catch (error) {
              console.log(error);
              Alert.alert('Error', 'Unable to delete player');
            }
          },
        },
      ]
    );
  };

  const filteredPlayers = players.filter((player) => {
    const nameMatch = player.player_name
      .toLowerCase()
      .includes(search.toLowerCase());

    const teamMatch = player.team_name
      .toLowerCase()
      .includes(search.toLowerCase());

    return nameMatch || teamMatch;
  });

  const renderPlayer = ({ item }) => (
    <View style={styles.playerCard}>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>
          {item.player_name}
        </Text>

        <Text style={styles.details}>
          Team: {item.team_name}
        </Text>

        <Text style={styles.details}>
          Role: {item.role}
        </Text>

        <Text style={styles.details}>
          Jersey: {item.jersey_number ?? 'Not assigned'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() =>
            navigation.navigate('PlayerProfile', { playerId: item.player_id })
          }
        >
          <Text style={styles.buttonText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditModal(item)}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deletePlayer(item)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cricket Players</Text>

      <Text style={styles.subtitle}>
        Manage your players and their teams
      </Text>

      <TextInput
        style={styles.search}
        placeholder="Search players or teams..."
        placeholderTextColor="#94A3B8"
        value={search}
        onChangeText={setSearch}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={openAddModal}
      >
        <Text style={styles.buttonText}>+ Add New Player</Text>
      </TouchableOpacity>

      <Text style={styles.count}>
        Total Players: {players.length}
      </Text>

      <FlatList
        data={filteredPlayers}
        keyExtractor={(item) => item.player_id.toString()}
        renderItem={renderPlayer}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No players found. Add your first player!
          </Text>
        }
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingPlayer ? 'Edit Player' : 'Add Player'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Player Name *"
              placeholderTextColor="#94A3B8"
              value={playerName}
              onChangeText={setPlayerName}
            />

            <TextInput
              style={styles.input}
              placeholder="Jersey Number"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={jerseyNumber}
              onChangeText={setJerseyNumber}
            />

            <Text style={styles.label}>Select Team</Text>

            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={teamId}
                onValueChange={(value) => setTeamId(value)}
                style={styles.picker}
                dropdownIconColor="#FFFFFF"
              >
                {teams.map((team) => (
                  <Picker.Item
                    key={team.team_id}
                    label={team.team_name}
                    value={String(team.team_id)}
                  />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Player Role</Text>

            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={role}
                onValueChange={setRole}
                style={styles.picker}
                dropdownIconColor="#FFFFFF"
              >
                {roles.map((item) => (
                  <Picker.Item
                    key={item}
                    label={item}
                    value={item}
                  />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Batting Style</Text>

            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={battingStyle}
                onValueChange={setBattingStyle}
                style={styles.picker}
                dropdownIconColor="#FFFFFF"
              >
                <Picker.Item label="Right-hand" value="Right-hand" />
                <Picker.Item label="Left-hand" value="Left-hand" />
              </Picker>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Bowling Style (e.g. Right-arm fast)"
              placeholderTextColor="#94A3B8"
              value={bowlingStyle}
              onChangeText={setBowlingStyle}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={savePlayer}
            >
              <Text style={styles.buttonText}>Save Player</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    padding: 20,
    paddingTop: 55,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#94A3B8',
    marginTop: 5,
    marginBottom: 20,
  },
  search: {
    backgroundColor: '#183528',
    color: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    marginBottom: 15,
  },
  addButton: {
    backgroundColor: '#16A34A',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  count: {
    color: '#CBD5E1',
    marginVertical: 18,
  },
  playerCard: {
    backgroundColor: '#183528',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  playerInfo: {
    marginBottom: 12,
  },
  playerName: {
    color: '#22C55E',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  details: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  profileButton: {
    backgroundColor: '#16A34A',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#2563EB',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  empty: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 40,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 15,
  },
  modalContent: {
    backgroundColor: '#183528',
    padding: 20,
    borderRadius: 15,
    maxHeight: '90%',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#0B1F16',
    color: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  label: {
    color: '#CBD5E1',
    marginTop: 5,
    marginBottom: 3,
    fontSize: 13,
  },
  pickerContainer: {
    backgroundColor: '#0B1F16',
    borderRadius: 8,
    marginBottom: 10,
  },
  picker: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#16A34A',
    padding: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#475569',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
});
