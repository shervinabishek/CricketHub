
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PlaceholderScreen({ title }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        Welcome to CricketHub
      </Text>
      <Text style={styles.description}>
        This section is under development.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#22C55E',
    fontSize: 30,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 12,
  },
  description: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
});
