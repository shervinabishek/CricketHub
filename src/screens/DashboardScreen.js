
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/db';

const formatOvers = (balls) =>
  `${Math.floor(Number(balls) / 6)}.${Number(balls) % 6}`;

export default function DashboardScreen() {
  const [counts, setCounts] = useState({
    teams: 0,
    players: 0,
    matches: 0,
    live: 0,
  });
  const [liveMatches, setLiveMatches] = useState([]);
  const [topBatter, setTopBatter] = useState(null);
  const [topBowler, setTopBowler] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const db = await getDatabase();

      const c = await db.getFirstAsync(`
        SELECT
          (SELECT COUNT(*) FROM teams) AS teams,
          (SELECT COUNT(*) FROM players) AS players,
          (SELECT COUNT(*) FROM matches) AS matches,
          (SELECT COUNT(*) FROM matches WHERE status = 'Live') AS live
      `);
      setCounts(c);

      const live = await db.getAllAsync(`
        SELECT m.match_id, m.format, t1.team_name AS team1_name,
               t2.team_name AS team2_name
        FROM matches m
        JOIN teams t1 ON t1.team_id = m.team1_id
        JOIN teams t2 ON t2.team_id = m.team2_id
        WHERE m.status = 'Live'
        ORDER BY m.match_date DESC
        LIMIT 5
      `);

      for (const match of live) {
        match.innings = await db.getAllAsync(
          `SELECT i.*, t.team_name
           FROM innings i JOIN teams t ON t.team_id = i.batting_team_id
           WHERE i.match_id = ? ORDER BY i.innings_number`,
          [match.match_id]
        );
      }
      setLiveMatches(live);

      const batter = await db.getFirstAsync(`
        SELECT p.player_name, SUM(be.batter_runs) AS runs
        FROM ball_events be JOIN players p ON p.player_id = be.striker_id
        GROUP BY p.player_id
        ORDER BY runs DESC LIMIT 1
      `);
      setTopBatter(batter && batter.runs > 0 ? batter : null);

      const bowler = await db.getFirstAsync(`
        SELECT p.player_name, COUNT(*) AS wickets
        FROM ball_events be JOIN players p ON p.player_id = be.bowler_id
        WHERE be.is_wicket = 1
          AND be.wicket_type IN ('bowled','caught','lbw','stumped','hit_wicket')
        GROUP BY p.player_id
        ORDER BY wickets DESC LIMIT 1
      `);
      setTopBowler(bowler || null);
    } catch (error) {
      console.log('Dashboard error:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const stat = (value, label) => (
    <View style={styles.statCard}>
      <Text style={styles.statNumber}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>WELCOME TO</Text>
          <Text style={styles.logo}>CricketHub 🏏</Text>
          <Text style={styles.subtitle}>
            Your cricket statistics companion
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Overview</Text>

      <View style={styles.statsContainer}>
        {stat(counts.teams, 'Teams')}
        {stat(counts.players, 'Players')}
        {stat(counts.matches, 'Matches')}
        {stat(counts.live, 'Live Matches')}
      </View>

      <Text style={styles.sectionTitle}>Live Matches</Text>

      {liveMatches.length === 0 ? (
        <View style={styles.playerCard}>
          <Text style={styles.playerDetails}>
            No live matches right now. Start scoring from the Scorecards tab.
          </Text>
        </View>
      ) : (
        liveMatches.map((match) => (
          <View key={match.match_id} style={[styles.matchCard, styles.cardGap]}>
            <View style={styles.matchHeader}>
              <Text style={styles.matchType}>{match.format} MATCH</Text>
              <Text style={styles.live}>● LIVE</Text>
            </View>

            {match.innings.length === 0 ? (
              <>
                <Text style={styles.team}>{match.team1_name}</Text>
                <Text style={styles.team}>{match.team2_name}</Text>
                <Text style={styles.playerDetails}>Yet to start</Text>
              </>
            ) : (
              match.innings.map((inn) => (
                <View key={inn.innings_id}>
                  <Text style={styles.team}>{inn.team_name}</Text>
                  <Text style={styles.score}>
                    {inn.total_runs}/{inn.wickets} ({formatOvers(inn.balls_bowled)})
                  </Text>
                </View>
              ))
            )}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Top Performers</Text>

      <View style={[styles.playerCard, styles.cardGap]}>
        <Text style={styles.playerName}>Top Run Scorer</Text>
        <Text style={styles.playerDetails}>
          {topBatter
            ? `${topBatter.player_name} • ${topBatter.runs} Runs`
            : 'No scoring data yet'}
        </Text>
      </View>

      <View style={styles.playerCard}>
        <Text style={styles.playerName}>Top Wicket Taker</Text>
        <Text style={styles.playerDetails}>
          {topBowler
            ? `${topBowler.player_name} • ${topBowler.wickets} Wickets`
            : 'No wickets yet'}
        </Text>
      </View>

      <Text style={styles.footer}>
        CricketHub • Offline Cricket Management
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F16',
    padding: 20,
  },
  header: {
    marginTop: 45,
    marginBottom: 30,
  },
  greeting: {
    color: '#94A3B8',
    fontSize: 12,
    letterSpacing: 2,
  },
  logo: {
    color: '#22C55E',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 5,
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 5,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#183528',
    padding: 20,
    borderRadius: 14,
    marginBottom: 12,
  },
  statNumber: {
    color: '#22C55E',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    marginTop: 5,
  },
  cardGap: {
    marginBottom: 12,
  },
  matchCard: {
    backgroundColor: '#183528',
    padding: 18,
    borderRadius: 14,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  matchType: {
    color: '#94A3B8',
    fontSize: 12,
  },
  live: {
    color: '#22C55E',
    fontWeight: 'bold',
  },
  team: {
    color: '#FFFFFF',
    fontSize: 15,
    marginTop: 8,
  },
  score: {
    color: '#22C55E',
    fontSize: 19,
    fontWeight: 'bold',
    marginTop: 3,
  },
  playerCard: {
    backgroundColor: '#183528',
    padding: 18,
    borderRadius: 14,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  playerDetails: {
    color: '#94A3B8',
    marginTop: 8,
  },
  footer: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 30,
    marginBottom: 25,
    fontSize: 12,
  },
});
