
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { initializeDatabase } from './src/database/db';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function setup() {
      try {
        await initializeDatabase();
        setReady(true);
      } catch (e) {
        console.log(e);
        setError('Database initialization failed');
      }
    }

    setup();
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#22C55E" />
        <Text style={styles.loading}>Loading CricketHub...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    color: 'white',
    marginTop: 15,
  },
  error: {
    color: '#EF4444',
  },
});
