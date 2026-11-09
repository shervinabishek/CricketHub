import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/db';

const BOWLER_WICKETS = "('bowled','caught','lbw','stumped','hit_wicket')";

const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const fixed = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : '-';

const dismissalLabel = (row) => {
  if (!row) return 'not out';
  const f = row.fielder_name;
  const b = row.bowler_name;
  switch (row.wicket_type) {
    case 'bowled': return `b ${b}`;
    case 'caught': return `c ${f || 'fielder'} b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'stumped': return `st ${f || 'keeper'} b ${b}`;
    case 'run_out': return 'run out';
    case 'hit_wicket': return `hit wicket b ${b}`;
    default: return String(row.wicket_type).replace(/_/g, ' ');
  }
};

export default function PlayerProfileScreen({ route }) {
  const { playerId } = route.params;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('batting');

  const load = useCallback(async () => {
    try {
      const db = await getDatabase();

      const player = await db.getFirstAsync(
        `SELECT p.*, t.team_name FROM players p
         JOIN teams t ON t.team_id = p.team_id
         WHERE p.player_id = ?`,
        [playerId]
      );

      if (!player) {
        setProfile(null);
        return;
      }

      // ---------- Batting: one row per innings batted ----------
      const batRows = await db.getAllAsync(
        `SELECT i.innings_id, i.match_id,
           COALESCE(SUM(CASE WHEN be.striker_id = ? THEN be.batter_runs ELSE 0 END), 0) AS runs,
           COALESCE(SUM(CASE WHEN be.striker_id = ?
                              AND be.extras_type NOT IN ('wide','no_ball')
                             THEN 1 ELSE 0 END), 0) AS balls,
           COALESCE(SUM(CASE WHEN be.striker_id = ? AND be.batter_runs = 4 THEN 1 ELSE 0 END), 0) AS fours,
           COALESCE(SUM(CASE WHEN be.striker_id = ? AND be.batter_runs = 6 THEN 1 ELSE 0 END), 0) AS sixes
         FROM ball_events be
         JOIN innings i ON i.innings_id = be.innings_id
         WHERE be.striker_id = ? OR be.non_striker_id = ? OR be.dismissed_player_id = ?
         GROUP BY i.innings_id`,
        [playerId, playerId, playerId, playerId, playerId, playerId, playerId]
      );

      const outRows = await db.getAllAsync(
        `SELECT be.innings_id, be.wicket_type,
                bw.player_name AS bowler_name, f.player_name AS fielder_name
         FROM ball_events be
         JOIN players bw ON bw.player_id = be.bowler_id
         LEFT JOIN players f ON f.player_id = be.fielder_id
         WHERE be.is_wicket = 1 AND be.dismissed_player_id = ?`,
        [playerId]
      );
      const outMap = new Map(outRows.map(r => [r.innings_id, r]));

      // ---------- Bowling: one row per innings bowled ----------
      const bowlRows = await db.getAllAsync(
        `SELECT i.innings_id, i.match_id,
           COALESCE(SUM(be.legal_delivery), 0) AS balls,
           COALESCE(SUM(CASE WHEN be.extras_type IN ('bye','leg_bye') THEN 0
                             ELSE be.total_runs END), 0) AS runs,
           COALESCE(SUM(CASE WHEN be.is_wicket = 1
                              AND be.wicket_type IN ${BOWLER_WICKETS}
                             THEN 1 ELSE 0 END), 0) AS wickets
         FROM ball_events be
         JOIN innings i ON i.innings_id = be.innings_id
         WHERE be.bowler_id = ?
         GROUP BY i.innings_id`,
        [playerId]
      );

      // ---------- Fielding ----------
      const field = await db.getFirstAsync(
        `SELECT
           COALESCE(SUM(CASE WHEN wicket_type = 'caught' THEN 1 ELSE 0 END), 0) AS catches,
           COALESCE(SUM(CASE WHEN wicket_type = 'stumped' THEN 1 ELSE 0 END), 0) AS stumpings,
           COALESCE(SUM(CASE WHEN wicket_type = 'run_out' THEN 1 ELSE 0 END), 0) AS run_outs
         FROM ball_events WHERE is_wicket = 1 AND fielder_id = ?`,
        [playerId]
      );

      const fieldMatchRows = await db.getAllAsync(
        `SELECT DISTINCT i.match_id
         FROM ball_events be JOIN innings i ON i.innings_id = be.innings_id
         WHERE be.fielder_id = ?`,
        [playerId]
      );

      // ---------- Batting summary ----------
      const batting = batRows.map(r => {
        const out = outMap.get(r.innings_id) || null;
        return { ...r, out };
      });

      const batInnings = batting.length;
      const notOuts = batting.filter(r => !r.out).length;
      const totalRuns = batting.reduce((a, r) => a + r.runs, 0);
      const totalBalls = batting.reduce((a, r) => a + r.balls, 0);
      const dismissals = batInnings - notOuts;

      let highest = null;
      for (const r of batting) {
        if (
          !highest ||
          r.runs > highest.runs ||
          (r.runs === highest.runs && !r.out && highest.out)
        ) {
          highest = r;
        }
      }

      const batSummary = {
        innings: batInnings,
        notOuts,
        runs: totalRuns,
        balls: totalBalls,
        highest: highest ? `${highest.runs}${highest.out ? '' : '*'}` : '-',
        average: dismissals > 0 ? totalRuns / dismissals : NaN,
        strikeRate: totalBalls > 0 ? (totalRuns / totalBalls) * 100 : NaN,
        fours: batting.reduce((a, r) => a + r.fours, 0),
        sixes: batting.reduce((a, r) => a + r.sixes, 0),
        fifties: batting.filter(r => r.runs >= 50 && r.runs < 100).length,
        hundreds: batting.filter(r => r.runs >= 100).length,
        ducks: batting.filter(r => r.out && r.runs === 0).length,
      };

      // ---------- Bowling summary ----------
      const bowlBalls = bowlRows.reduce((a, r) => a + r.balls, 0);
      const bowlRuns = bowlRows.reduce((a, r) => a + r.runs, 0);
      const bowlWkts = bowlRows.reduce((a, r) => a + r.wickets, 0);

      let best = null;
      for (const r of bowlRows) {
        if (
          !best ||
          r.wickets > best.wickets ||
          (r.wickets === best.wickets && r.runs < best.runs)
        ) {
          best = r;
        }
      }

      const bowlSummary = {
        innings: bowlRows.length,
        overs: oversText(bowlBalls),
        runs: bowlRuns,
        wickets: bowlWkts,
        best: best && (best.balls > 0 || best.wickets > 0)
          ? `${best.wickets}/${best.runs}`
          : '-',
        average: bowlWkts > 0 ? bowlRuns / bowlWkts : NaN,
        economy: bowlBalls > 0 ? bowlRuns / (bowlBalls / 6) : NaN,
        strikeRate: bowlWkts > 0 ? bowlBalls / bowlWkts : NaN,
        threeW: bowlRows.filter(r => r.wickets >= 3 && r.wickets < 5).length,
        fiveW: bowlRows.filter(r => r.wickets >= 5).length,
      };

      // ---------- Per-match details ----------
      const matchIds = new Set([
        ...batting.map(r => r.match_id),
        ...bowlRows.map(r => r.match_id),
        ...fieldMatchRows.map(r => r.match_id),
      ]);

      const matches = [];
      for (const matchId of matchIds) {
        const m = await db.getFirstAsync(
          `SELECT m.match_id, m.match_date, m.format, m.status,
                  m.winner_team_id, m.team1_id, m.team2_id,
                  t1.team_name AS team1_name, t2.team_name AS team2_name
           FROM matches m
           JOIN teams t1 ON t1.team_id = m.team1_id
           JOIN teams t2 ON t2.team_id = m.team2_id
           WHERE m.match_id = ?`,
          [matchId]
        );
        if (!m) continue;

        const opponent =
          Number(m.team1_id) === Number(player.team_id) ? m.team2_name : m.team1_name;

        const bat = batting.filter(r => r.match_id === matchId);
        const bowl = bowlRows.filter(r => r.match_id === matchId);

        let result = '';
        if (m.status === 'Completed') {
          result = m.winner_team_id == null
            ? 'Tied'
            : Number(m.winner_team_id) === Number(player.team_id) ? 'Won' : 'Lost';
        } else {
          result = m.status;
        }

        matches.push({
          matchId,
          date: m.match_date,
          format: m.format,
          opponent,
          result,
          batting: bat.map(r => ({
            text: `${r.runs}${r.out ? '' : '*'} (${r.balls})`,
            detail: `4s ${r.fours} • 6s ${r.sixes} • ${dismissalLabel(r.out)}`,
          })),
          bowling: bowl.map(r => ({
            text: `${r.wickets}/${r.runs} (${oversText(r.balls)} ov)`,
          })),
        });
      }
      matches.sort((a, b) => (a.date < b.date ? 1 : -1));

      setProfile({
        player,
        matchesPlayed: matches.length,
        batSummary,
        bowlSummary,
        field,
        matches,
      });
    } catch (error) {
      console.log('Player profile error:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Player not found.</Text>
      </View>
    );
  }

  const { player, batSummary: b, bowlSummary: w, field, matches } = profile;

  const stat = (label, value) => (
    <View style={styles.stat} key={label}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {player.player_name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{player.player_name}</Text>
        <Text style={styles.team}>{player.team_name}</Text>
        <Text style={styles.meta}>
          {player.role || 'Player'}
          {player.jersey_number != null ? `  •  #${player.jersey_number}` : ''}
        </Text>
        <Text style={styles.meta}>
          Bat: {player.batting_style || '-'}
          {player.bowling_style ? `  •  Bowl: ${player.bowling_style}` : ''}
        </Text>
      </View>

      <View style={styles.grid}>
        {stat('Matches', profile.matchesPlayed)}
        {stat('Runs', b.runs)}
        {stat('Wickets', w.wickets)}
        {stat('Catches', field.catches)}
      </View>

      <View style={styles.tabs}>
        {['batting', 'bowling', 'fielding', 'matches'].map(name => (
          <TouchableOpacity
            key={name}
            style={[styles.tab, tab === name && styles.tabActive]}
            onPress={() => setTab(name)}
          >
            <Text style={styles.tabText}>{name.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'batting' && (
        <View style={styles.grid}>
          {stat('Innings', b.innings)}
          {stat('Not outs', b.notOuts)}
          {stat('Runs', b.runs)}
          {stat('Highest', b.highest)}
          {stat('Average', fixed(b.average))}
          {stat('Strike rate', fixed(b.strikeRate))}
          {stat('Balls faced', b.balls)}
          {stat('Fours', b.fours)}
          {stat('Sixes', b.sixes)}
          {stat('50s', b.fifties)}
          {stat('100s', b.hundreds)}
          {stat('Ducks', b.ducks)}
        </View>
      )}

      {tab === 'bowling' && (
        <View style={styles.grid}>
          {stat('Innings', w.innings)}
          {stat('Overs', w.overs)}
          {stat('Runs', w.runs)}
          {stat('Wickets', w.wickets)}
          {stat('Best figures', w.best)}
          {stat('Average', fixed(w.average))}
          {stat('Economy', fixed(w.economy))}
          {stat('Strike rate', fixed(w.strikeRate, 1))}
          {stat('3-wkt hauls', w.threeW)}
          {stat('5-wkt hauls', w.fiveW)}
        </View>
      )}

      {tab === 'fielding' && (
        <View style={styles.grid}>
          {stat('Catches', field.catches)}
          {stat('Stumpings', field.stumpings)}
          {stat('Run outs', field.run_outs)}
          {stat('Dismissals', field.catches + field.stumpings + field.run_outs)}
        </View>
      )}

      {tab === 'matches' && (
        <View>
          {matches.length === 0 ? (
            <Text style={styles.muted}>No match records yet.</Text>
          ) : (
            matches.map(m => (
              <View key={m.matchId} style={styles.matchCard}>
                <View style={styles.matchTop}>
                  <Text style={styles.matchTitle}>vs {m.opponent}</Text>
                  <Text style={styles.matchResult}>{m.result}</Text>
                </View>
                <Text style={styles.meta}>{m.date} • {m.format}</Text>
                {m.batting.map((r, i) => (
                  <Text key={`b${i}`} style={styles.matchLine}>
                    Batting: {r.text}  <Text style={styles.meta}>{r.detail}</Text>
                  </Text>
                ))}
                {m.bowling.map((r, i) => (
                  <Text key={`w${i}`} style={styles.matchLine}>Bowling: {r.text}</Text>
                ))}
                {m.batting.length === 0 && m.bowling.length === 0 && (
                  <Text style={styles.meta}>Fielding only</Text>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F16', padding: 16 },
  center: { flex: 1, backgroundColor: '#0B1F16', justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#94A3B8', textAlign: 'center', marginTop: 20 },
  headerCard: {
    backgroundColor: '#183528',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: 'bold' },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  team: { color: '#22C55E', fontSize: 15, marginTop: 3, fontWeight: 'bold' },
  meta: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  stat: {
    width: '31%',
    backgroundColor: '#183528',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: '2%',
    marginBottom: 10,
  },
  statValue: { color: '#22C55E', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#CBD5E1', fontSize: 11, marginTop: 4, textAlign: 'center' },
  tabs: { flexDirection: 'row', marginBottom: 12 },
  tab: {
    flex: 1,
    backgroundColor: '#183528',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 6,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: '#16A34A' },
  tabText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  matchCard: { backgroundColor: '#183528', borderRadius: 12, padding: 14, marginBottom: 10 },
  matchTop: { flexDirection: 'row', justifyContent: 'space-between' },
  matchTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  matchResult: { color: '#22C55E', fontWeight: 'bold' },
  matchLine: { color: '#E2E8F0', marginTop: 6, fontSize: 13 },
});
