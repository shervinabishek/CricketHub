
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from '../screens/DashboardScreen';
import TeamsScreen from '../screens/TeamsScreen';
import PlayersScreen from '../screens/PlayersScreen';
import MatchesScreen from '../screens/MatchesScreen';
import ScorecardScreen from '../screens/ScorecardScreen';
import InningsScreen from '../screens/InningsScreen';
import PlayerSelectionScreen from '../screens/PlayerSelectionScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FullScorecardScreen from '../screens/FullScorecardScreen';
import SquadScreen from '../screens/SquadScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';


const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#183528',
          borderTopColor: '#294638',
        },
        tabBarActiveTintColor: '#22C55E',
        tabBarInactiveTintColor: '#A7C4B3',
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Players"
        component={PlayersScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Scorecards"
        component={ScorecardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Innings"
        component={InningsScreen}
        options={{
          title: 'Match Innings',
          headerStyle: { backgroundColor: '#183528' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <Stack.Screen
        name="PlayerSelection"
        component={PlayerSelectionScreen}
        options={{
          title: 'Select Player',
          headerStyle: { backgroundColor: '#183528' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <Stack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={{
          title: 'Player Profile',
          headerStyle: { backgroundColor: '#183528' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <Stack.Screen
        name="Squad"
        component={SquadScreen}
        options={{
          title: 'Playing XI & Bench',
          headerStyle: { backgroundColor: '#183528' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <Stack.Screen
        name="FullScorecard"
        component={FullScorecardScreen}
        options={{
          title: 'Full Scorecard',
          headerStyle: { backgroundColor: '#183528' },
          headerTintColor: '#FFFFFF',
        }}
      />
    </Stack.Navigator>
  );
}
