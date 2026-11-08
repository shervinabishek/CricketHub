
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
  ScrollView,
} from 'react-native';

import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/db';

const formats = ['T10', 'T20', 'ODI', 'Test'];
const statuses = ['Scheduled', 'Live', 'Completed'];

// Default overs based on match format
const getDefaultOvers = (format) => {
  const defaults = {
    T10: '10',
    T20: '20',
    ODI: '50',
    Test: '',
  };

  return defaults[format];
};

// Format date as YYYY-MM-DD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export default function MatchesScreen() {
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);

  // Match form states
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [venue, setVenue] = useState('');
  const [format, setFormat] = useState('T20');
  const [oversLimit, setOversLimit] = useState('20');
  const [status, setStatus] = useState('Scheduled');

  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // Load teams and matches
  const loadData = async () => {
    try {
      const db = await getDatabase();

      const teamData = await db.getAllAsync(
        'SELECT * FROM teams ORDER BY team_name'
      );

      const matchData = await db.getAllAsync(`
        SELECT
          matches.*,
          t1.team_name AS team1_name,
          t2.team_name AS team2_name
        FROM matches
        JOIN teams t1 ON matches.team1_id = t1.team_id
        JOIN teams t2 ON matches.team2_id = t2.team_id
        ORDER BY matches.match_date DESC
      `);

      setTeams(teamData);
      setMatches(matchData);
    } catch (error) {
      console.log('Load matches error:', error);
      Alert.alert('Error', 'Unable to load matches.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Reset form
  const resetForm = () => {
    setTeam1('');
    setTeam2('');
    setMatchDate('');
    setVenue('');
    setFormat('T20');
    setOversLimit('20');
    setStatus('Scheduled');
    setEditingMatch(null);
    setDatePickerVisible(false);
  };

  // Open add match form
  const openAddModal = () => {
    if (teams.length < 2) {
      Alert.alert(
        'Not Enough Teams',
        'Please add at least two teams before creating a match.'
      );
      return;
    }

    resetForm();

    setTeam1(String(teams[0].team_id));
    setTeam2(String(teams[1].team_id));

    setModalVisible(true);
  };

  // Open edit match form
  const openEditModal = (match) => {
    setEditingMatch(match);

    setTeam1(String(match.team1_id));
    setTeam2(String(match.team2_id));
    setMatchDate(match.match_date);
    setVenue(match.venue || '');
    setFormat(match.format);
    setOversLimit(
      match.overs_limit == null
        ? ''
        : String(match.overs_limit)
    );
    setStatus(match.status);

    setModalVisible(true);
  };

  // Automatically fill overs when format changes
  const changeFormat = (newFormat) => {
    setFormat(newFormat);
    setOversLimit(getDefaultOvers(newFormat));
  };

  // Save match
  const saveMatch = async () => {
    if (!team1 || !team2 || !matchDate) {
      Alert.alert(
        'Missing Details',
        'Please select both teams and the match date.'
      );
      return;
    }

    if (Number(team1) === Number(team2)) {
      Alert.alert(
        'Invalid Teams',
        'Please select two different teams.'
      );
      return;
    }

    // Overs can be customized by the user.
    // For Test matches, blank means unlimited overs.
    let selectedOvers = null;

    if (oversLimit.trim() !== '') {
      selectedOvers = Number(oversLimit);

      if (
        !Number.isInteger(selectedOvers) ||
        selectedOvers <= 0
      ) {
        Alert.alert(
          'Invalid Overs',
          'Please enter a valid positive number of overs.'
        );
        return;
      }
    } else if (format !== 'Test') {
      Alert.alert(
        'Overs Required',
        'Please enter the overs limit for this match.'
      );
      return;
    }

    try {
      const db = await getDatabase();

      if (editingMatch) {
        await db.runAsync(
          `UPDATE matches
           SET team1_id = ?,
               team2_id = ?,
               match_date = ?,
               venue = ?,
               format = ?,
               overs_limit = ?,
               status = ?
           WHERE match_id = ?`,
          [
            Number(team1),
            Number(team2),
            matchDate,
            venue.trim(),
            format,
            selectedOvers,
            status,
            editingMatch.match_id,
          ]
        );

        Alert.alert('Success', 'Match updated successfully.');
      } else {
        await db.runAsync(
          `INSERT INTO matches
           (team1_id, team2_id, match_date, venue, format, overs_limit, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(team1),
            Number(team2),
            matchDate,
            venue.trim(),
            format,
            selectedOvers,
            status,
          ]
        );

        Alert.alert('Success', 'Match added successfully.');
      }

      setModalVisible(false);
      resetForm();
      loadData();

    } catch (error) {
      console.log('Save match error:', error);
      Alert.alert('Error', 'Unable to save match.');
    }
  };

  // Delete match
  const deleteMatch = (match) => {
    Alert.alert(
      'Delete Match',
      `Delete ${match.team1_name} vs ${match.team2_name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDatabase();

              await db.runAsync(
                'DELETE FROM matches WHERE match_id = ?',
                [match.match_id]
              );

              loadData();

            } catch (error) {
              console.log('Delete match error:', error);
              Alert.alert('Error', 'Unable to delete match.');
            }
          },
        },
      ]
    );
  };

  // Search and filter
  const filteredMatches = matches.filter((item) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      item.team1_name.toLowerCase().includes(searchText) ||
      item.team2_name.toLowerCase().includes(searchText) ||
      (item.venue || '').toLowerCase().includes(searchText);

    const matchesFilter =
      filter === 'All' || item.status === filter;

    return matchesSearch && matchesFilter;
  });

  // Match card
  const renderMatch = ({ item }) => (
    <View style={styles.matchCard}>

      <View style={styles.matchHeader}>
        <Text style={styles.matchDate}>{item.match_date}</Text>

        <Text
          style={[
            styles.status,
            item.status === 'Live' && styles.liveStatus,
            item.status === 'Completed' && styles.completedStatus,
          ]}
        >
          {item.status}
        </Text>
      </View>

      <Text style={styles.teamsText}>
        {item.team1_name} VS {item.team2_name}
      </Text>

      <Text style={styles.format}>
        {item.format}
        {item.overs_limit != null
          ? ` • ${item.overs_limit} Overs`
          : ' • Unlimited Overs'}
      </Text>

      <Text style={styles.venue}>
        Venue: {item.venue || 'Not specified'}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditModal(item)}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteMatch(item)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>

      {/* Header and Add Match button */}
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>Matches</Text>
          <Text style={styles.subheading}>
            Manage your cricket matches
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
        >
          <Text style={styles.addButtonText}>+ Add Match</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search team or venue..."
        placeholderTextColor="#A0A0A0"
        value={search}
        onChangeText={setSearch}
      />

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
      >
        {['All', ...statuses].map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterButton,
              filter === item && styles.activeFilter,
            ]}
            onPress={() => setFilter(item)}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.activeFilterText,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Match list */}
      <FlatList
        data={filteredMatches}
        keyExtractor={(item) => String(item.match_id)}
        renderItem={renderMatch}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No matches found. Add a new match!
          </Text>
        }
      />

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>

            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={styles.modalTitle}>
                {editingMatch ? 'Edit Match' : 'Add New Match'}
              </Text>

              {/* Team 1 */}
              <Text style={styles.label}>Team 1 *</Text>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={team1}
                  onValueChange={setTeam1}
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

              {/* Team 2 */}
              <Text style={styles.label}>Team 2 *</Text>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={team2}
                  onValueChange={setTeam2}
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

              {/* Date */}
              <Text style={styles.label}>Match Date *</Text>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={styles.dateText}>
                  {matchDate || 'Select Match Date 📅'}
                </Text>
              </TouchableOpacity>

              {datePickerVisible && (
                <DateTimePicker
                  value={
                    matchDate
                      ? new Date(`${matchDate}T12:00:00`)
                      : new Date()
                  }
                  mode="date"
                  display="calendar"
                  onChange={(event, selectedDate) => {
                    setDatePickerVisible(false);

                    if (event.type === 'set' && selectedDate) {
                      setMatchDate(formatDate(selectedDate));
                    }
                  }}
                />
              )}

              {/* Venue */}
              <Text style={styles.label}>Venue</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter match venue"
                placeholderTextColor="#A0A0A0"
                value={venue}
                onChangeText={setVenue}
              />

              {/* Format */}
              <Text style={styles.label}>Match Format *</Text>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={format}
                  onValueChange={changeFormat}
                  style={styles.picker}
                  dropdownIconColor="#FFFFFF"
                >
                  {formats.map((item) => (
                    <Picker.Item
                      key={item}
                      label={item}
                      value={item}
                    />
                  ))}
                </Picker>
              </View>

              {/* Editable overs */}
              <Text style={styles.label}>Overs Limit</Text>

              <TextInput
                style={styles.input}
                placeholder={
                  format === 'Test'
                    ? 'Unlimited (or enter custom overs)'
                    : 'Enter overs limit'
                }
                placeholderTextColor="#A0A0A0"
                value={oversLimit}
                onChangeText={setOversLimit}
                keyboardType="number-pad"
              />

              <Text style={styles.helperText}>
                {format === 'Test'
                  ? 'Default: Unlimited. You can enter a custom limit.'
                  : `Default for ${format}: ${getDefaultOvers(format)} overs. You can change it.`}
              </Text>

              {/* Status */}
              <Text style={styles.label}>Match Status</Text>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={status}
                  onValueChange={setStatus}
                  style={styles.picker}
                  dropdownIconColor="#FFFFFF"
                >
                  {statuses.map((item) => (
                    <Picker.Item
                      key={item}
                      label={item}
                      value={item}
                    />
                  ))}
                </Picker>
              </View>

              {/* Save */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveMatch}
              >
                <Text style={styles.saveButtonText}>
                  {editingMatch ? 'Update Match' : 'Add Match'}
                </Text>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    padding: 16,
  },

  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  heading: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
  },

  subheading: {
    color: '#A0B5A8',
    fontSize: 13,
    marginTop: 4,
  },

  addButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
  },

  addButtonText: {
    color: '#07150D',
    fontWeight: 'bold',
    fontSize: 13,
  },

  searchInput: {
    backgroundColor: '#183528',
    color: '#FFFFFF',
    padding: 13,
    borderRadius: 8,
    marginBottom: 12,
  },

  filterScroll: {
    maxHeight: 42,
    marginBottom: 12,
  },

  filterButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: '#183528',
    borderRadius: 20,
    marginRight: 8,
  },

  activeFilter: {
    backgroundColor: '#22C55E',
  },

  filterText: {
    color: '#D1D5DB',
    fontSize: 13,
  },

  activeFilterText: {
    color: '#07150D',
    fontWeight: 'bold',
  },

  listContent: {
    paddingBottom: 20,
  },

  matchCard: {
    backgroundColor: '#183528',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  matchDate: {
    color: '#A0B5A8',
    fontSize: 12,
  },

  status: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: 'bold',
  },

  liveStatus: {
    color: '#EF4444',
  },

  completedStatus: {
    color: '#22C55E',
  },

  teamsText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  format: {
    color: '#22C55E',
    fontSize: 13,
    marginBottom: 6,
  },

  venue: {
    color: '#A0B5A8',
    fontSize: 13,
  },

  actionRow: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 10,
  },

  editButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 6,
  },

  deleteButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 6,
  },

  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  emptyText: {
    color: '#A0B5A8',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },

  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 16,
  },

  modalContent: {
    backgroundColor: '#10291D',
    padding: 20,
    borderRadius: 14,
    maxHeight: '90%',
  },

  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 18,
  },

  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 7,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#0B1F16',
    color: '#FFFFFF',
    padding: 13,
    borderRadius: 8,
    marginBottom: 10,
  },

  pickerContainer: {
    backgroundColor: '#0B1F16',
    borderRadius: 8,
    marginBottom: 10,
  },

  picker: {
    color: '#FFFFFF',
    height: 52,
  },

  dateButton: {
    backgroundColor: '#0B1F16',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
  },

  dateText: {
    color: '#FFFFFF',
    fontSize: 14,
  },

  helperText: {
    color: '#A0B5A8',
    fontSize: 11,
    marginBottom: 10,
  },

  saveButton: {
    backgroundColor: '#22C55E',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 18,
  },

  saveButtonText: {
    color: '#07150D',
    fontWeight: 'bold',
    fontSize: 15,
  },

  cancelButton: {
    backgroundColor: '#374151',
    padding: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },

  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
