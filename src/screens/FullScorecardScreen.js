
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/db';

const describeDismissal = (row) => {
  if (!row) return 'Not out';
  const f = row.fielder_name;
  const b = row.bowler_name;
  switch (row.wicket_type) {
    case 'bowled': return `b ${b}`;
    case 'caught': return `c ${f || 'fielder'} b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'stumped': return `st ${f || 'keeper'} b ${b}`;
    case 'run_out': return `run out (${f || 'fielder'})`;
    case 'hit_wicket': return `hit wicket b ${b}`;
    case 'retired_out': return 'retired out';
    case 'obstructing_the_field': return 'obstructing the field';
    default: return String(row.wicket_type).replace(/_/g, ' ');
  }
};

export default function FullScorecardScreen({ route }) {
  const { matchId } = route.params;

  const [inningsData, setInningsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matchInfo, setMatchInfo] = useState(null);

  const loadScorecard = useCallback(async () => {
    try {
      const db = await getDatabase();

      const inningsRows = await db.getAllAsync(
        `SELECT
           i.*,
           t.team_name AS batting_team_name
         FROM innings i
         JOIN teams t ON t.team_id = i.batting_team_id
         WHERE i.match_id = ?
         ORDER BY i.innings_number ASC`,
        [matchId]
      );

      const completeData = [];

      for (const innings of inningsRows) {
        const battingRows = await db.getAllAsync(
          `SELECT
             p.player_id,
             p.player_name,
             COALESCE(SUM(be.batter_runs), 0) AS runs,
             COALESCE(SUM(
               CASE
                 WHEN be.extras_type NOT IN ('wide', 'no_ball')
                 THEN 1 ELSE 0
               END
             ), 0) AS balls,
             COALESCE(SUM(
               CASE WHEN be.batter_runs = 4 THEN 1 ELSE 0 END
             ), 0) AS fours,
             COALESCE(SUM(
               CASE WHEN be.batter_runs = 6 THEN 1 ELSE 0 END
             ), 0) AS sixes,
             MAX(
               CASE
                 WHEN be.is_wicket = 1
                  AND be.dismissed_player_id = p.player_id
                 THEN be.wicket_type
                 ELSE NULL
               END
             ) AS dismissal
           FROM players p
           JOIN ball_events be
             ON be.striker_id = p.player_id
           WHERE be.innings_id = ?
           GROUP BY p.player_id, p.player_name
           ORDER BY MIN(be.delivery_number) ASC`,
          [innings.innings_id]
        );

        // Include dismissed players who were not the striker,
        // such as a non-striker dismissed run out.
        const dismissedRows = await db.getAllAsync(
          `SELECT DISTINCT
             p.player_id,
             p.player_name
           FROM ball_events be
           JOIN players p
             ON p.player_id = be.dismissed_player_id
           WHERE be.innings_id = ?
             AND be.is_wicket = 1`,
          [innings.innings_id]
        );

        const battingMap = new Map(
          battingRows.map(player => [player.player_id, player])
        );

        for (const player of dismissedRows) {
          if (!battingMap.has(player.player_id)) {
            battingMap.set(player.player_id, {
              ...player,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              dismissal: null,
            });
          }
        }

        // Get dismissal information for every dismissed player.
        for (const player of battingMap.values()) {
          const dismissalRow = await db.getFirstAsync(
            `SELECT be.wicket_type,
                    bw.player_name AS bowler_name,
                    f.player_name AS fielder_name
             FROM ball_events be
             JOIN players bw ON bw.player_id = be.bowler_id
             LEFT JOIN players f ON f.player_id = be.fielder_id
             WHERE be.innings_id = ?
               AND be.is_wicket = 1
               AND be.dismissed_player_id = ?
             ORDER BY be.delivery_number DESC
             LIMIT 1`,
            [innings.innings_id, player.player_id]
          );

          player.dismissal = dismissalRow?.wicket_type || null;
          player.dismissalText = describeDismissal(dismissalRow);
        }

        const bowlingRows = await db.getAllAsync(
          `SELECT
             p.player_id,
             p.player_name,
             COALESCE(SUM(be.legal_delivery), 0) AS legal_balls,
             COALESCE(SUM(
               CASE
                 WHEN be.extras_type IN ('bye', 'leg_bye')
                 THEN 0
                 ELSE be.total_runs
               END
             ), 0) AS runs_conceded,
             COALESCE(SUM(
               CASE
                 WHEN be.is_wicket = 1
                  AND be.wicket_type IN (
                    'bowled',
                    'caught',
                    'lbw',
                    'stumped',
                    'hit_wicket'
                  )
                 THEN 1 ELSE 0
               END
             ), 0) AS wickets
           FROM players p
           JOIN ball_events be
             ON be.bowler_id = p.player_id
           WHERE be.innings_id = ?
           GROUP BY p.player_id, p.player_name
           ORDER BY MIN(be.delivery_number) ASC`,
          [innings.innings_id]
        );

        const extrasRow = await db.getFirstAsync(
          `SELECT
             COALESCE(SUM(CASE WHEN extras_type = 'wide' THEN extras_runs ELSE 0 END), 0) AS wides,
             COALESCE(SUM(CASE WHEN extras_type = 'no_ball' THEN extras_runs ELSE 0 END), 0) AS no_balls,
             COALESCE(SUM(CASE WHEN extras_type = 'bye' THEN extras_runs ELSE 0 END), 0) AS byes,
             COALESCE(SUM(CASE WHEN extras_type = 'leg_bye' THEN extras_runs ELSE 0 END), 0) AS leg_byes
           FROM ball_events WHERE innings_id = ?`,
          [innings.innings_id]
        );

        const fallRows = await db.getAllAsync(
          `SELECT p.player_name, be.delivery_number
           FROM ball_events be
           JOIN players p ON p.player_id = be.dismissed_player_id
           WHERE be.innings_id = ? AND be.is_wicket = 1
           ORDER BY be.delivery_number ASC`,
          [innings.innings_id]
        );

        completeData.push({
          ...innings,
          extras: extrasRow,
          fall: fallRows,
          batting: Array.from(battingMap.values()),
          bowling: bowlingRows,
        });
      }

      const matchRow = await db.getFirstAsync(
        `SELECT m.status, w.team_name AS winner_name
         FROM matches m
         LEFT JOIN teams w ON w.team_id = m.winner_team_id
         WHERE m.match_id = ?`,
        [matchId]
      );
      setMatchInfo(matchRow);
      setInningsData(completeData);
    } catch (error) {
      console.log('Full scorecard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      loadScorecard();
    }, [loadScorecard])
  );

  const formatOvers = balls => {
    const completedOvers = Math.floor(balls / 6);
    const remainingBalls = balls % 6;
    return `${completedOvers}.${remainingBalls}`;
  };

  const formatDismissal = dismissal => {
    if (!dismissal) return 'Not out';

    const labels = {
      bowled: 'b',
      caught: 'c',
      lbw: 'lbw',
      stumped: 'st',
      run_out: 'run out',
      hit_wicket: 'hit wicket',
      retired_hurt: 'retired hurt',
    };

    return labels[dismissal] || dismissal.replaceAll('_', ' ');
  };

  const renderInnings = (innings, index) => {
    const totalBalls = innings.balls_bowled || 0;

    return (
      <View key={innings.innings_id} style={styles.inningsCard}>
        <Text style={styles.inningsTitle}>
          {index + 1}{' '}
          {index === 0 ? '1st' : index === 1 ? '2nd' : `${index + 1}th`} Innings
        </Text>

        <Text style={styles.teamName}>
          {innings.batting_team_name}
        </Text>

        <View style={styles.scoreBox}>
          <Text style={styles.totalScore}>
            {innings.total_runs}/{innings.wickets}
          </Text>
          <Text style={styles.oversText}>
            Overs: {formatOvers(totalBalls)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Batting Scorecard</Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.playerColumn]}>
            Batter
          </Text>
          <Text style={styles.headerCell}>R</Text>
          <Text style={styles.headerCell}>B</Text>
          <Text style={styles.headerCell}>4s</Text>
          <Text style={styles.headerCell}>6s</Text>
          <Text style={styles.headerCell}>SR</Text>
        </View>

        {innings.batting.length === 0 ? (
          <Text style={styles.emptyText}>No batting records yet.</Text>
        ) : (
          innings.batting.map(player => (
            <View key={player.player_id} style={styles.tableRow}>
              <View style={styles.playerColumn}>
                <Text style={styles.playerName}>
                  {player.player_name}
                </Text>
                <Text style={styles.dismissalText}>
                  {player.dismissalText}
                </Text>
              </View>

              <Text style={styles.cell}>{player.runs}</Text>
              <Text style={styles.cell}>{player.balls}</Text>
              <Text style={styles.cell}>{player.fours}</Text>
              <Text style={styles.cell}>{player.sixes}</Text>
              <Text style={styles.cell}>
                {Number(player.balls) > 0
                  ? ((Number(player.runs) / Number(player.balls)) * 100).toFixed(1)
                  : '0.0'}
              </Text>
            </View>
          ))
        )}

        {(() => {
          const e = innings.extras || {};
          const total =
            Number(e.wides) + Number(e.no_balls) + Number(e.byes) + Number(e.leg_byes);
          return (
            <Text style={styles.dismissalText}>
              Extras: {total} (b {e.byes}, lb {e.leg_byes}, w {e.wides}, nb {e.no_balls})
              {'\n'}Total: {innings.total_runs}/{innings.wickets} ({formatOvers(totalBalls)} ov)
            </Text>
          );
        })()}

        {innings.fall && innings.fall.length > 0 && (
          <Text style={styles.dismissalText}>
            {'\n'}Fall of wickets: {innings.fall
              .map((w, i) => `${i + 1}. ${w.player_name}`)
              .join(', ')}
          </Text>
        )}

        <Text style={styles.sectionTitle}>Bowling Scorecard</Text>

        <View style={styles.bowlingHeader}>
          <Text style={[styles.headerCell, styles.bowlerColumn]}>
            Bowler
          </Text>
          <Text style={styles.headerCell}>O</Text>
          <Text style={styles.headerCell}>R</Text>
          <Text style={styles.headerCell}>W</Text>
          <Text style={styles.headerCell}>ECO</Text>
        </View>

        {innings.bowling.length === 0 ? (
          <Text style={styles.emptyText}>No bowling records yet.</Text>
        ) : (
          innings.bowling.map(player => (
            <View key={player.player_id} style={styles.tableRow}>
              <Text
                style={[styles.playerName, styles.bowlerColumn]}
                numberOfLines={1}
              >
                {player.player_name}
              </Text>
              <Text style={styles.cell}>
                {formatOvers(player.legal_balls)}
              </Text>
              <Text style={styles.cell}>
                {player.runs_conceded}
              </Text>
              <Text style={styles.cell}>
                {player.wickets}
              </Text>
              <Text style={styles.cell}>
                {Number(player.legal_balls) > 0
                  ? (Number(player.runs_conceded) / (Number(player.legal_balls) / 6)).toFixed(2)
                  : '0.00'}
              </Text>
            </View>
          ))
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#138A45" />
        <Text style={styles.loadingText}>Loading scorecard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadScorecard();
          }}
        />
      }
    >
      <Text style={styles.pageTitle}>Full Match Scorecard</Text>

      {matchInfo?.status === 'Completed' && (
        <Text style={styles.teamName}>
          {matchInfo.winner_name
            ? `Result: ${matchInfo.winner_name} won`
            : 'Result: Match tied'}
        </Text>
      )}

      {inningsData.length === 0 ? (
        <Text style={styles.emptyText}>
          No innings have been recorded for this match yet.
        </Text>
      ) : (
        inningsData.map(renderInnings)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5',
  },
  content: {
    padding: 15,
    paddingBottom: 35,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F7F5',
  },
  loadingText: {
    marginTop: 10,
    color: '#555',
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: 'bold',
    color: '#145A32',
    marginBottom: 15,
  },
  inningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    elevation: 2,
  },
  inningsTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#145A32',
  },
  teamName: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  scoreBox: {
    backgroundColor: '#E8F5E9',
    padding: 15,
    borderRadius: 9,
    marginTop: 12,
    marginBottom: 18,
  },
  totalScore: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#145A32',
  },
  oversText: {
    fontSize: 14,
    color: '#555',
    marginTop: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#145A32',
    marginTop: 12,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 9,
    paddingHorizontal: 5,
  },
  bowlingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 9,
    paddingHorizontal: 5,
  },
  headerCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#145A32',
  },
  playerColumn: {
    flex: 2.5,
  },
  bowlerColumn: {
    flex: 2.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  dismissalText: {
    fontSize: 11,
    color: '#777',
    marginTop: 3,
  },
  cell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: '#333',
  },
  emptyText: {
    color: '#777',
    fontSize: 13,
    paddingVertical: 12,
  },
});
