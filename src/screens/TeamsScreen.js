
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

import { useFocusEffect } from '@react-navigation/native';
import { getDatabase, deleteTeamCascade } from '../database/db';

export default function TeamsScreen() {
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  const [teamName, setTeamName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [homeGround, setHomeGround] = useState('');

  const loadTeams = async () => {
    try {
      const db = await getDatabase();

      const result = await db.getAllAsync(
        'SELECT * FROM teams ORDER BY team_name ASC'
      );

      setTeams(result);
    } catch (error) {
      Alert.alert('Error', 'Unable to load teams');
      console.log(error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTeams();
    }, [])
  );

  const openAddModal = () => {
    setEditingTeam(null);
    setTeamName('');
    setCoachName('');
    setHomeGround('');
    setModalVisible(true);
  };

  const openEditModal = (team) => {
    setEditingTeam(team);
    setTeamName(team.team_name);
    setCoachName(team.coach_name || '');
    setHomeGround(team.home_ground || '');
    setModalVisible(true);
  };

  const saveTeam = async () => {
    if (!teamName.trim()) {
      Alert.alert('Required', 'Please enter a team name');
      return;
    }

    try {
      const db = await getDatabase();

      if (editingTeam) {
        await db.runAsync(
          `UPDATE teams
           SET team_name = ?, coach_name = ?, home_ground = ?
           WHERE team_id = ?`,
          teamName.trim(),
          coachName.trim(),
          homeGround.trim(),
          editingTeam.team_id
        );
      } else {
        await db.runAsync(
          `INSERT INTO teams
           (team_name, coach_name, home_ground)
           VALUES (?, ?, ?)`,
          teamName.trim(),
          coachName.trim(),
          homeGround.trim()
        );
      }

      setModalVisible(false);
      loadTeams();

      Alert.alert(
        'Success',
        editingTeam ? 'Team updated successfully' : 'Team added successfully'
      );

    } catch (error) {
      if (error.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate Team', 'This team name already exists');
      } else {
        Alert.alert('Error', 'Unable to save team');
        console.log(error);
      }
    }
  };

  const deleteTeam = (team) => {
    Alert.alert(
      'Delete Team',
      `Delete ${team.team_name}? All its players and every match it played (with scores) will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTeamCascade(team.team_id);
              loadTeams();
            } catch (error) {
              Alert.alert('Error', 'Unable to delete team');
              console.log(error);
            }
          },
        },
      ]
    );
  };

  const filteredTeams = teams.filter((team) =>
    team.team_name.toLowerCase().includes(search.toLowerCase())
  );

  const renderTeam = ({ item }) => (
    <View style={styles.teamCard}>
      <View style={styles.teamInfo}>
        <Text style={styles.teamName}>{item.team_name}</Text>

        <Text style={styles.details}>
          Coach: {item.coach_name || 'Not added'}
        </Text>

        <Text style={styles.details}>
          Ground: {item.home_ground || 'Not added'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditModal(item)}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteTeam(item)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>

      <Text style={styles.title}>Cricket Teams</Text>

      <Text style={styles.subtitle}>
        Manage your cricket teams
      </Text>

      <TextInput
        style={styles.search}
        placeholder="Search teams..."
        placeholderTextColor="#94A3B8"
        value={search}
        onChangeText={setSearch}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={openAddModal}
      >
        <Text style={styles.addButtonText}>+ Add New Team</Text>
      </TouchableOpacity>

      <Text style={styles.count}>
        Total Teams: {teams.length}
      </Text>

      <FlatList
        data={filteredTeams}
        keyExtractor={(item) => item.team_id.toString()}
        renderItem={renderTeam}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No teams found. Add your first team!
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
              {editingTeam ? 'Edit Team' : 'Add New Team'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Team Name *"
              placeholderTextColor="#94A3B8"
              value={teamName}
              onChangeText={setTeamName}
            />

            <TextInput
              style={styles.input}
              placeholder="Coach Name"
              placeholderTextColor="#94A3B8"
              value={coachName}
              onChangeText={setCoachName}
            />

            <TextInput
              style={styles.input}
              placeholder="Home Ground"
              placeholderTextColor="#94A3B8"
              value={homeGround}
              onChangeText={setHomeGround}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveTeam}
            >
              <Text style={styles.addButtonText}>Save Team</Text>
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
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  count: {
    color: '#CBD5E1',
    marginVertical: 18,
  },
  teamCard: {
    backgroundColor: '#183528',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  teamInfo: {
    marginBottom: 12,
  },
  teamName: {
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
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#183528',
    padding: 22,
    borderRadius: 15,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#0B1F16',
    color: '#FFFFFF',
    padding: 13,
    borderRadius: 8,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#16A34A',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  cancelButton: {
    backgroundColor: '#475569',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
});
