
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import {
  getDatabase,
  ensureSquad,
  getPlayingPlayers,
  recalcInnings,
} from '../database/db';

const wicketTypes = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'retired_out',
  'obstructing_the_field',
];

const formatWicket = (type) =>
  type
    ? type.split('_').map(
        word => word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    : '';

export default function InningsScreen({ route, navigation }) {
  const { matchId, team1Id, team2Id, team1Name, team2Name } = route.params;

  // Database connection
  const [db, setDb] = useState(null);

  const [inningsList, setInningsList] = useState([]);
  const [currentInnings, setCurrentInnings] = useState(null);
  const [battingPlayers, setBattingPlayers] = useState([]);
  const [bowlingPlayers, setBowlingPlayers] = useState([]);

  const [selectedStriker, setSelectedStriker] = useState('');
  const [selectedNonStriker, setSelectedNonStriker] = useState('');
  const [selectedBowler, setSelectedBowler] = useState('');

  const [selectedWicketType, setSelectedWicketType] = useState('bowled');
  const [selectedFielder, setSelectedFielder] = useState('');
  const [selectedDismissedPlayer, setSelectedDismissedPlayer] = useState('');

  const [waitingForBatsman, setWaitingForBatsman] = useState(false);
  const [waitingForBatsmanTarget, setWaitingForBatsmanTarget] = useState('striker');
  const [waitingForBowler, setWaitingForBowler] = useState(false);

  const [battingStats, setBattingStats] = useState([]);
  const [bowlingStats, setBowlingStats] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [dismissedPlayerIds, setDismissedPlayerIds] = useState([]);
  const [previousBowlerId, setPreviousBowlerId] = useState('');
  const [loading, setLoading] = useState(false);
  const restoredRef = useRef(false);
  const [setupDone, setSetupDone] = useState(false);
  const [runOutWho, setRunOutWho] = useState('striker');
  const [runOutRuns, setRunOutRuns] = useState(0);
  const [runOutExtra, setRunOutExtra] = useState('none');
  const [tossWinner, setTossWinner] = useState(String(team1Id));
  const [tossDecision, setTossDecision] = useState('bat');
  const [oversLimit, setOversLimit] = useState(null);
  const [matchStatus, setMatchStatus] = useState('Scheduled');

  // Initialize database before using it
  useEffect(() => {
    let isActive = true;

    const initializeDatabase = async () => {
      try {
        const database = await getDatabase();

        if (isActive) {
          setDb(database);
          console.log('InningsScreen database ready');
        }
      } catch (error) {
        console.error('Database initialization error:', error);
        Alert.alert(
          'Database Error',
          error.message || 'Could not initialize database.'
        );
      }
    };

    initializeDatabase();

    return () => {
      isActive = false;
    };
  }, []);

  const loadPlayers = async (battingTeamId) => {
    const bowlingTeamId =
      Number(battingTeamId) === Number(team1Id) ? team2Id : team1Id;

    // Only players in the active playing XI are available.
    // Bench players cannot bat, bowl or field.
    await ensureSquad(matchId, battingTeamId);
    await ensureSquad(matchId, bowlingTeamId);
    const batting = await getPlayingPlayers(matchId, battingTeamId);
    const bowling = await getPlayingPlayers(matchId, bowlingTeamId);

    setBattingPlayers(batting);
    setBowlingPlayers(bowling);

    setSelectedStriker(old =>
      batting.some(p => String(p.player_id) === old)
        ? old
        : ''
    );

    setSelectedNonStriker(old =>
      batting.some(p => String(p.player_id) === old)
        ? old
        : ''
    );

    setSelectedBowler(old =>
      bowling.some(p => String(p.player_id) === old) ? old : ''
    );

    setSelectedFielder(old =>
      bowling.some(p => String(p.player_id) === old)
        ? old
        : bowling[0] ? String(bowling[0].player_id) : ''
    );

    return { batting, bowling };
  };

  const refreshScoreData = async (innings) => {
    if (!innings || !db) return;

    const id = innings.innings_id;

    const updated = await db.getAllAsync(
      'SELECT * FROM innings WHERE innings_id = ?',
      [id]
    );

    if (updated.length) setCurrentInnings(updated[0]);

    const batting = await db.getAllAsync(
      `SELECT
        p.player_id,
        p.player_name,
        COALESCE(SUM(be.batter_runs), 0) AS runs,
        COALESCE(SUM(
          CASE WHEN be.extras_type NOT IN ('wide', 'no_ball')
          THEN 1 ELSE 0 END
        ), 0) AS balls,
        COALESCE(SUM(
          CASE WHEN be.batter_runs = 4 THEN 1 ELSE 0 END
        ), 0) AS fours,
        COALESCE(SUM(
          CASE WHEN be.batter_runs = 6 THEN 1 ELSE 0 END
        ), 0) AS sixes
       FROM players p
       LEFT JOIN ball_events be
         ON be.striker_id = p.player_id
         AND be.innings_id = ?
       WHERE p.team_id = ?
       GROUP BY p.player_id, p.player_name
       ORDER BY runs DESC`,
      [id, innings.batting_team_id]
    );

    setBattingStats(batting);

    const bowlingTeamId =
      Number(innings.batting_team_id) === Number(team1Id)
        ? team2Id
        : team1Id;

    const bowling = await db.getAllAsync(
      `SELECT
        p.player_id,
        p.player_name,
        COALESCE(SUM(be.legal_delivery), 0) AS legal_balls,
        COALESCE(SUM(
          CASE
            WHEN be.extras_type NOT IN ('bye', 'leg_bye')
            THEN be.total_runs ELSE 0
          END
        ), 0) AS runs_conceded,
        COALESCE(SUM(
          CASE
            WHEN be.is_wicket = 1
            AND be.wicket_type IN (
              'bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'
            )
            THEN 1 ELSE 0
          END
        ), 0) AS wickets
       FROM players p
       LEFT JOIN ball_events be
         ON be.bowler_id = p.player_id
         AND be.innings_id = ?
       WHERE p.team_id = ?
       GROUP BY p.player_id, p.player_name
       ORDER BY wickets DESC, runs_conceded ASC`,
      [id, bowlingTeamId]
    );

    setBowlingStats(bowling);

    const history = await db.getAllAsync(
      `SELECT
        be.*,
        striker.player_name AS striker_name,
        bowler.player_name AS bowler_name,
        fielder.player_name AS fielder_name,
        dismissed.player_name AS dismissed_name
       FROM ball_events be
       JOIN players striker ON be.striker_id = striker.player_id
       JOIN players bowler ON be.bowler_id = bowler.player_id
       LEFT JOIN players fielder ON be.fielder_id = fielder.player_id
       LEFT JOIN players dismissed ON be.dismissed_player_id = dismissed.player_id
       WHERE be.innings_id = ?
       ORDER BY be.delivery_number DESC
       LIMIT 18`,
      [id]
    );

    setDeliveryHistory(history);

    const dismissedRows = await db.getAllAsync(
      `SELECT dismissed_player_id
       FROM ball_events
       WHERE innings_id = ?
       AND is_wicket = 1
       AND dismissed_player_id IS NOT NULL`,
      [id]
    );

    setDismissedPlayerIds(
      dismissedRows.map(row => Number(row.dismissed_player_id))
    );
  };

  const loadInnings = async () => {
    if (!db) return;

    try {
      await ensureSquad(matchId, team1Id);
      await ensureSquad(matchId, team2Id);

      const matchRow = await db.getFirstAsync(
        'SELECT overs_limit, status, toss_winner_id, toss_decision FROM matches WHERE match_id = ?',
        [matchId]
      );
      if (matchRow?.toss_winner_id) {
        setTossWinner(String(matchRow.toss_winner_id));
        setTossDecision(matchRow.toss_decision || 'bat');
      }
      const oversLimitFromMatch = matchRow?.overs_limit ?? null;
      setOversLimit(oversLimitFromMatch);
      setMatchStatus(matchRow?.status ?? 'Scheduled');

      const rows = await db.getAllAsync(
        `SELECT innings.*, teams.team_name AS batting_team_name
         FROM innings
         JOIN teams ON innings.batting_team_id = teams.team_id
         WHERE innings.match_id = ?
         ORDER BY innings.innings_number`,
        [matchId]
      );

      setInningsList(rows);

      if (rows.length) {
        const latest = rows[rows.length - 1];
        setCurrentInnings(latest);

        const loaded = await loadPlayers(latest.batting_team_id);
        const maxWk = loaded.batting.length
          ? Math.max(1, Math.min(10, loaded.batting.length - 1))
          : 10;

        // Restore the on-field state when re-opening an innings in progress
        if (!restoredRef.current) {
          restoredRef.current = true;
          const last = await db.getFirstAsync(
            `SELECT * FROM ball_events WHERE innings_id = ?
             ORDER BY delivery_number DESC LIMIT 1`,
            [latest.innings_id]
          );

          if (last) {
            const isPenalty =
              last.extras_type === 'wide' || last.extras_type === 'no_ball';
            const runsRun =
              Number(last.batter_runs) +
              Math.max(0, Number(last.extras_runs) - (isPenalty ? 1 : 0));

            let st = String(last.striker_id);
            let non = String(last.non_striker_id);
            if (runsRun % 2 === 1) [st, non] = [non, st];

            const balls = Number(latest.balls_bowled);
            const overDone =
              Number(last.legal_delivery) === 1 && balls > 0 && balls % 6 === 0;
            if (overDone) [st, non] = [non, st];

            const ended = Number(latest.wickets) >= maxWk ||
              (oversLimitFromMatch && balls >= oversLimitFromMatch * 6);

            if (last.is_wicket) {
              const dismissed = String(last.dismissed_player_id);
              const strikerOut = dismissed === st;
              if (strikerOut) st = ''; else non = '';
              if (!ended) {
                setWaitingForBatsman(true);
                setWaitingForBatsmanTarget(strikerOut ? 'striker' : 'nonStriker');
              }
            }

            setSetupDone(true);
            setSelectedStriker(st);
            setSelectedNonStriker(non);

            if (overDone) {
              setPreviousBowlerId(String(last.bowler_id));
              setSelectedBowler('');
              if (!ended) setWaitingForBowler(true);
            } else {
              setSelectedBowler(String(last.bowler_id));
            }
          } else {
            // No deliveries yet: openers must be chosen first
            setSetupDone(false);
            setSelectedStriker('');
            setSelectedNonStriker('');
            setSelectedBowler('');
          }
        }

        const selectedId = route.params?.selectedPlayerId;
        const selectionMode = route.params?.selectionMode;
        const selectionTarget = route.params?.selectionTarget;

        if (selectedId && selectionMode === 'batsman') {
          if (selectionTarget === 'nonStriker') {
            setSelectedNonStriker(String(selectedId));
          } else {
            setSelectedStriker(String(selectedId));
          }
          setWaitingForBatsman(false);
        } else if (selectedId && selectionMode === 'bowler') {
          setSelectedBowler(String(selectedId));
          setWaitingForBowler(false);
        }

        if (selectedId) {
          navigation.setParams({
            selectedPlayerId: undefined,
            selectionMode: undefined,
            selectionTarget: undefined,
          });
        }

        await refreshScoreData(latest);
      } else {
        setCurrentInnings(null);
        setBattingPlayers([]);
        setBowlingPlayers([]);
        setBattingStats([]);
        setBowlingStats([]);
        setDeliveryHistory([]);
      }
    } catch (error) {
      console.error('Load innings error:', error);
      Alert.alert(
        'Error',
        'Could not load innings: ' + (error.message || String(error))
      );
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!db) return;

      loadInnings();
    }, [
      db,
      matchId,
      route.params?.selectedPlayerId,
      route.params?.selectionMode,
      route.params?.selectionTarget,
    ])
  );

  const openPlayerSelection = (mode, target = 'striker') => {
    if (!currentInnings) return;

    const bowlingTeamId =
      Number(currentInnings.batting_team_id) === Number(team1Id)
        ? team2Id
        : team1Id;

    navigation.setParams({ selectionTarget: target });

    navigation.navigate('PlayerSelection', {
      mode,
      matchId,
      teamId: mode === 'batsman'
        ? currentInnings.batting_team_id
        : bowlingTeamId,
      excludedPlayerIds: dismissedPlayerIds,
      currentNonStrikerId: target === 'striker'
        ? selectedNonStriker
        : selectedStriker,
      previousBowlerId,
    });
  };

  const openFullScorecard = () => {
    navigation.navigate('FullScorecard', { matchId });
  };

  const createInnings = async () => {
    if (!db) return;

    try {
      const number = inningsList.length + 1;

      if (number > 2) {
        Alert.alert('Notice', 'Both innings have already been created.');
        return;
      }

      // Both teams need players in the playing XI
      for (const teamId of [team1Id, team2Id]) {
        await ensureSquad(matchId, teamId);
        const playing = await getPlayingPlayers(matchId, teamId);
        if (playing.length < 2) {
          Alert.alert(
            'Playing XI needed',
            'Each team needs at least 2 playing players. Open "Playing XI / Bench" to choose them.'
          );
          return;
        }
      }

      let battingTeamId;
      if (number === 1) {
        const winner = Number(tossWinner);
        const loser = winner === Number(team1Id) ? team2Id : team1Id;
        battingTeamId = tossDecision === 'bat' ? winner : loser;

        await db.runAsync(
          'UPDATE matches SET toss_winner_id = ?, toss_decision = ? WHERE match_id = ?',
          [winner, tossDecision, matchId]
        );
      } else {
        battingTeamId =
          Number(inningsList[0].batting_team_id) === Number(team1Id)
            ? team2Id
            : team1Id;
      }

      await db.runAsync(
        `INSERT INTO innings
         (match_id, batting_team_id, innings_number,
          total_runs, wickets, balls_bowled)
         VALUES (?, ?, ?, 0, 0, 0)`,
        [matchId, battingTeamId, number]
      );

      await db.runAsync(
        "UPDATE matches SET status = 'Live' WHERE match_id = ?",
        [matchId]
      );

      setSetupDone(false);
      restoredRef.current = true;
      setSelectedStriker('');
      setSelectedNonStriker('');
      setSelectedBowler('');
      setWaitingForBatsman(false);
      setWaitingForBowler(false);
      setDismissedPlayerIds([]);
      setPreviousBowlerId('');

      await loadInnings();
    } catch (error) {
      console.error('Create innings error:', error);
      Alert.alert(
        'Error',
        'Could not create the innings: ' + (error.message || String(error))
      );
    }
  };

  const validateSelections = () => {
    if (!currentInnings) {
      Alert.alert('Notice', 'Create an innings first.');
      return false;
    }

    if (!selectedStriker || !selectedNonStriker || !selectedBowler) {
      Alert.alert('Select players', 'Choose both batsmen and a bowler.');
      return false;
    }

    if (selectedStriker === selectedNonStriker) {
      Alert.alert('Invalid selection', 'The two batsmen must be different.');
      return false;
    }

    if (waitingForBatsman || waitingForBowler) {
      Alert.alert(
        'Selection required',
        'Complete the pending player selection first.'
      );
      return false;
    }

    if (getInningsEndReason(currentInnings)) {
      Alert.alert('Innings complete', 'This innings has already finished.');
      return false;
    }

    return true;
  };

  const recordDelivery = async ({
    batterRuns = 0,
    extrasType = 'none',
    extrasRuns = 0,
    isWicket = 0,
    wicketType = null,
    dismissedPlayerId = null,
    fielderId = null,
  }) => {
    if (!db || loading || !validateSelections()) return;

    try {
      setLoading(true);

      const id = currentInnings.innings_id;
      const strikerId = Number(selectedStriker);
      const nonStrikerId = Number(selectedNonStriker);
      const bowlerId = Number(selectedBowler);

      const dismissedId = isWicket
        ? Number(dismissedPlayerId || strikerId)
        : null;

      const legal =
        extrasType === 'wide' || extrasType === 'no_ball' ? 0 : 1;

      const total = batterRuns + extrasRuns;

      const next = await db.getAllAsync(
        `SELECT COALESCE(MAX(delivery_number), 0) + 1 AS n
         FROM ball_events WHERE innings_id = ?`,
        [id]
      );

      await db.runAsync(
        `INSERT INTO ball_events
         (innings_id, delivery_number, striker_id, non_striker_id,
          bowler_id, batter_runs, extras_type, extras_runs, total_runs,
          is_wicket, wicket_type, dismissed_player_id, fielder_id,
          legal_delivery)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          next[0].n,
          strikerId,
          nonStrikerId,
          bowlerId,
          batterRuns,
          extrasType,
          extrasRuns,
          total,
          isWicket,
          wicketType,
          dismissedId,
          fielderId ? Number(fielderId) : null,
          legal,
        ]
      );

      const runs = Number(currentInnings.total_runs) + total;
      const wickets = Number(currentInnings.wickets) + (isWicket ? 1 : 0);
      const balls = Number(currentInnings.balls_bowled) + legal;

      await db.runAsync(
        `UPDATE innings
         SET total_runs = ?, wickets = ?, balls_bowled = ?
         WHERE innings_id = ?`,
        [runs, wickets, balls, id]
      );

      let nextStriker = selectedStriker;
      let nextNonStriker = selectedNonStriker;

      // Wide/no-ball penalty run is not a run taken by the batsmen.
      const penalty =
        extrasType === 'wide' || extrasType === 'no_ball' ? 1 : 0;
      const runsRun = batterRuns + Math.max(0, extrasRuns - penalty);

      if (runsRun % 2 === 1) {
        [nextStriker, nextNonStriker] = [
          nextNonStriker,
          nextStriker,
        ];
      }

      const overCompleted = legal === 1 && balls > 0 && balls % 6 === 0;

      if (overCompleted) {
        [nextStriker, nextNonStriker] = [
          nextNonStriker,
          nextStriker,
        ];
      }

      if (isWicket) {
        const dismissed = await db.getAllAsync(
          `SELECT dismissed_player_id
           FROM ball_events
           WHERE innings_id = ?
           AND is_wicket = 1
           AND dismissed_player_id IS NOT NULL`,
          [id]
        );

        const dismissedIds = dismissed.map(
          row => Number(row.dismissed_player_id)
        );

        const strikerWasDismissed =
          dismissedId === Number(nextStriker);

        const replacementTarget = strikerWasDismissed
          ? 'striker'
          : 'nonStriker';

        const otherBatter = strikerWasDismissed
          ? nextNonStriker
          : nextStriker;

        const incoming = battingPlayers.find(
          player =>
            !dismissedIds.includes(Number(player.player_id)) &&
            Number(player.player_id) !== Number(otherBatter)
        );

        if (strikerWasDismissed) {
          nextStriker = '';
        } else {
          nextNonStriker = '';
        }

        setWaitingForBatsman(wickets < maxWickets && Boolean(incoming));
        setWaitingForBatsmanTarget(replacementTarget);
      }

      setSelectedStriker(nextStriker);
      setSelectedNonStriker(nextNonStriker);

      if (overCompleted) {
        setPreviousBowlerId(selectedBowler);
        setSelectedBowler('');
        setWaitingForBowler(true);
      }

      const updatedInnings = {
        ...currentInnings,
        total_runs: runs,
        wickets,
        balls_bowled: balls,
      };

      setCurrentInnings(updatedInnings);
      await refreshScoreData(updatedInnings);

      const endReason = getInningsEndReason(updatedInnings);

      if (endReason) {
        setWaitingForBatsman(false);
        setWaitingForBowler(false);
        await finishMatchIfNeeded(updatedInnings);
        Alert.alert(
          'Innings complete',
          endReason === 'All out' ? 'The batting side is all out.' : endReason + '.'
        );
      } else if (isWicket && overCompleted) {
        Alert.alert(
          'Wicket and over complete',
          'Select the incoming batsman and the next bowler.'
        );
      } else if (isWicket) {
        Alert.alert(
          'Wicket!',
          `${formatWicket(wicketType)} recorded. Select the incoming batsman, then use SWAP STRIKE if the strike needs changing.`
        );
      } else if (overCompleted) {
        Alert.alert('Over completed', 'Select the next bowler.');
      }
    } catch (error) {
      console.error('Record delivery error:', error);
      Alert.alert(
        'Save Delivery Error',
        error.message || String(error)
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmWicket = () => {
    const type = selectedWicketType;
    const isRunOut = type === 'run_out';
    const needsFielder = ['caught', 'stumped'].includes(type);

    if (needsFielder && !selectedFielder) {
      Alert.alert('Select fielder', 'Please select the fielder involved.');
      return;
    }

    if (isRunOut && (!selectedStriker || !selectedNonStriker)) {
      Alert.alert('Select batters', 'Both batters must be on the field.');
      return;
    }

    // Run-out: the batter chosen by the scorer is out, whichever end
    const dismissedId = isRunOut
      ? Number(runOutWho === 'nonStriker' ? selectedNonStriker : selectedStriker)
      : Number(selectedStriker);

    const dismissedName = battingPlayers.find(
      player => Number(player.player_id) === dismissedId
    )?.player_name;

    const fielderId = needsFielder || (isRunOut && selectedFielder)
      ? selectedFielder
      : null;

    const fielderName = bowlingPlayers.find(
      player => Number(player.player_id) === Number(fielderId)
    )?.player_name;

    // Runs completed before the run-out
    let batterRuns = 0;
    let extrasType = 'none';
    let extrasRuns = 0;

    if (isRunOut) {
      if (runOutExtra === 'wide') {
        extrasType = 'wide';
        extrasRuns = 1 + runOutRuns;
      } else if (runOutExtra === 'no_ball') {
        extrasType = 'no_ball';
        extrasRuns = 1;
        batterRuns = runOutRuns;
      } else {
        batterRuns = runOutRuns;
      }
    }

    let description = formatWicket(type);

    if (type === 'caught') {
      description = `Caught by ${fielderName}`;
    } else if (type === 'stumped') {
      description = `Stumped by ${fielderName}`;
    } else if (isRunOut) {
      description = `${dismissedName} run out${fielderName ? ` by ${fielderName}` : ''} after ${runOutRuns} run(s) completed`;
    }

    Alert.alert(
      'Confirm wicket',
      `${description}. ${dismissedName} will be dismissed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'CONFIRM WICKET',
          style: 'destructive',
          onPress: () => {
            recordDelivery({
              batterRuns,
              extrasType,
              extrasRuns,
              isWicket: 1,
              wicketType: type,
              dismissedPlayerId: dismissedId,
              fielderId,
            });
            setRunOutRuns(0);
            setRunOutExtra('none');
            setRunOutWho('striker');
          },
        },
      ]
    );
  };

  const maxWickets = battingPlayers.length
    ? Math.max(1, Math.min(10, battingPlayers.length - 1))
    : 10;

  const firstInningsRuns = inningsList.length
    ? Number(inningsList[0].total_runs)
    : 0;

  const getInningsEndReason = (innings) => {
    if (!innings) return null;
    if (Number(innings.wickets) >= maxWickets) return 'All out';
    if (oversLimit && Number(innings.balls_bowled) >= oversLimit * 6) {
      return 'Overs completed';
    }
    if (
      Number(innings.innings_number) === 2 &&
      Number(innings.total_runs) > firstInningsRuns
    ) {
      return 'Target chased';
    }
    return null;
  };

  const inningsEndReason = getInningsEndReason(currentInnings);

  const getResultText = () => {
    if (!currentInnings || Number(currentInnings.innings_number) !== 2) return '';
    if (!inningsEndReason) return '';
    const secondRuns = Number(currentInnings.total_runs);
    if (secondRuns > firstInningsRuns) {
      return `${currentTeamName} won by ${maxWickets - Number(currentInnings.wickets)} wickets`;
    }
    const firstTeam = inningsList[0]?.batting_team_name;
    if (secondRuns === firstInningsRuns) return 'Match tied';
    return `${firstTeam} won by ${firstInningsRuns - secondRuns} runs`;
  };

  const finishMatchIfNeeded = async (innings) => {
    if (!getInningsEndReason(innings)) return;
    if (Number(innings.innings_number) !== 2) return;

    const secondRuns = Number(innings.total_runs);
    let winner = null;
    if (secondRuns > firstInningsRuns) winner = innings.batting_team_id;
    else if (secondRuns < firstInningsRuns) winner = inningsList[0].batting_team_id;

    await db.runAsync(
      'UPDATE matches SET status = ?, winner_team_id = ? WHERE match_id = ?',
      ['Completed', winner, matchId]
    );
    setMatchStatus('Completed');
  };

  const openSquad = () => {
    navigation.navigate('Squad', {
      matchId,
      team1Id,
      team2Id,
      team1Name,
      team2Name,
    });
  };

  const startScoring = () => {
    if (!selectedStriker || !selectedNonStriker) {
      Alert.alert('Select batters', 'Choose both opening batters and who is on strike.');
      return;
    }
    if (selectedStriker === selectedNonStriker) {
      Alert.alert('Invalid selection', 'The two batters must be different.');
      return;
    }
    if (!selectedBowler) {
      Alert.alert('Select bowler', 'Choose the opening bowler.');
      return;
    }
    setSetupDone(true);
  };

  const swapOpeners = () => {
    setSelectedStriker(selectedNonStriker);
    setSelectedNonStriker(selectedStriker);
  };

  const undoLastBall = () => {
    if (!currentInnings) return;

    Alert.alert('Undo last ball', 'Remove the most recent delivery?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          try {
            const last = await db.getFirstAsync(
              `SELECT delivery_id FROM ball_events WHERE innings_id = ?
               ORDER BY delivery_number DESC LIMIT 1`,
              [currentInnings.innings_id]
            );

            if (!last) {
              Alert.alert('Nothing to undo', 'No deliveries recorded yet.');
              return;
            }

            await db.runAsync(
              'DELETE FROM ball_events WHERE delivery_id = ?',
              [last.delivery_id]
            );
            await recalcInnings(currentInnings.innings_id);

            if (matchStatus === 'Completed') {
              await db.runAsync(
                "UPDATE matches SET status = 'Live', winner_team_id = NULL WHERE match_id = ?",
                [matchId]
              );
            }

            setWaitingForBatsman(false);
            setWaitingForBowler(false);
            restoredRef.current = false;
            await loadInnings();
          } catch (error) {
            console.error('Undo error:', error);
            Alert.alert('Error', 'Could not undo the last ball.');
          }
        },
      },
    ]);
  };

  const getOvers = (balls) =>
    `${Math.floor(Number(balls) / 6)}.${Number(balls) % 6}`;

  const getRunRate = () => {
    if (!currentInnings || !Number(currentInnings.balls_bowled)) {
      return '0.00';
    }

    return (
      Number(currentInnings.total_runs) /
      (Number(currentInnings.balls_bowled) / 6)
    ).toFixed(2);
  };

  const deliveryLabel = (delivery) => {
    if (delivery.is_wicket) {
      return `W • ${formatWicket(delivery.wicket_type)}`;
    }
    if (delivery.extras_type === 'wide') return 'WD';
    if (delivery.extras_type === 'no_ball') return 'NB';
    if (delivery.extras_type === 'bye') return `B${delivery.extras_runs}`;
    if (delivery.extras_type === 'leg_bye') return `LB${delivery.extras_runs}`;
    return String(delivery.total_runs);
  };

  const striker = battingPlayers.find(
    player => String(player.player_id) === selectedStriker
  );

  const nonStriker = battingPlayers.find(
    player => String(player.player_id) === selectedNonStriker
  );

  const bowler = bowlingPlayers.find(
    player => String(player.player_id) === selectedBowler
  );

  const currentTeamName = currentInnings
    ? Number(currentInnings.batting_team_id) === Number(team1Id)
      ? team1Name
      : team2Name
    : '';

  const activeBatters = [striker, nonStriker].filter(Boolean);

  const activeBowlingStats = bowlingStats.filter(
    player =>
      Number(player.legal_balls) > 0 ||
      Number(player.runs_conceded) > 0
  );

  const runButton = (value) => (
    <TouchableOpacity
      key={value}
      style={styles.runButton}
      disabled={!db || loading || waitingForBatsman || waitingForBowler}
      onPress={() => recordDelivery({ batterRuns: value })}
    >
      <Text style={styles.runButtonText}>{value}</Text>
    </TouchableOpacity>
  );

  // Wait for database initialization
  if (!db) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingScreenText}>
          Preparing CricketHub database...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>
          cricket<Text style={styles.brandAccent}>hub</Text>
        </Text>
        <Text style={styles.topBarRight}>LIVE SCORING</Text>
      </View>

      <View style={styles.matchHeader}>
        <Text style={styles.matchTitle}>
          {team1Name} vs {team2Name}
        </Text>
        <Text style={styles.matchSubtitle}>
          MATCH CENTRE • {currentTeamName || 'READY TO START'}
        </Text>
      </View>

      {!currentInnings ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {inningsList.length === 0 ? 'Toss & Playing XI' : 'Ready for the next innings?'}
          </Text>

          {inningsList.length === 0 && (
            <>
              <Text style={styles.selectorLabel}>Toss won by</Text>
              <View style={styles.chipRow}>
                {[
                  { id: team1Id, name: team1Name },
                  { id: team2Id, name: team2Name },
                ].map(team => (
                  <TouchableOpacity
                    key={team.id}
                    style={[
                      styles.chip,
                      tossWinner === String(team.id) && styles.chipActive,
                    ]}
                    onPress={() => setTossWinner(String(team.id))}
                  >
                    <Text style={[styles.chipText, tossWinner === String(team.id) && styles.chipTextActive]} numberOfLines={1}>{team.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.selectorLabel}>Elected to</Text>
              <View style={styles.chipRow}>
                {[
                  { id: 'bat', name: 'Bat first' },
                  { id: 'bowl', name: 'Bowl first' },
                ].map(option => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.chip,
                      tossDecision === option.id && styles.chipActive,
                    ]}
                    onPress={() => setTossDecision(option.id)}
                  >
                    <Text style={[styles.chipText, tossDecision === option.id && styles.chipTextActive]}>{option.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.muted}>
            Players 1 to 11 of each team are selected automatically. Check or change
            the playing XI and bench before starting.
          </Text>

          <TouchableOpacity style={styles.secondaryButton} onPress={openSquad}>
            <Text style={styles.secondaryButtonText}>PLAYING XI / BENCH</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={createInnings}>
            <Text style={styles.primaryButtonText}>
              {inningsList.length === 0 ? 'START FIRST INNINGS' : 'START SECOND INNINGS'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.scorePanel}>
            <Text style={styles.inningsLabel}>
              {currentTeamName} • INNINGS {inningsList.length}
            </Text>

            <View style={styles.scoreLine}>
              <Text style={styles.bigScore}>
                {currentInnings.total_runs}/{currentInnings.wickets}
              </Text>
              <View style={styles.scoreSide}>
                <Text style={styles.oversText}>OVERS</Text>
                <Text style={styles.oversValue}>
                  {getOvers(currentInnings.balls_bowled)}
                </Text>
              </View>
            </View>

            {Number(currentInnings.innings_number) === 2 && (
              <Text style={styles.scoreFooterText}>
                TARGET {firstInningsRuns + 1}
                {oversLimit
                  ? ` • NEED ${Math.max(0, firstInningsRuns + 1 - Number(currentInnings.total_runs))} FROM ${Math.max(0, oversLimit * 6 - Number(currentInnings.balls_bowled))} BALLS`
                  : ''}
              </Text>
            )}

            <View style={styles.scoreFooter}>
              <Text style={styles.scoreFooterText}>CRR {getRunRate()}</Text>
              <Text style={styles.scoreFooterText}>
                BALLS {currentInnings.balls_bowled}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.fullScorecardButton}
            onPress={openFullScorecard}
          >
            <Text style={styles.fullScorecardButtonText}>
              VIEW FULL SCORECARD
            </Text>
          </TouchableOpacity>

          <View style={styles.toolRow}>
            <TouchableOpacity style={styles.toolButton} onPress={openSquad}>
              <Text style={styles.toolButtonText}>PLAYING XI / BENCH</Text>
            </TouchableOpacity>
            {setupDone && selectedStriker && selectedNonStriker && (
              <TouchableOpacity style={styles.toolButton} onPress={swapOpeners}>
                <Text style={styles.toolButtonText}>SWAP STRIKE</Text>
              </TouchableOpacity>
            )}
            {setupDone && (
              <TouchableOpacity style={styles.toolButton} onPress={undoLastBall}>
                <Text style={styles.toolButtonText}>UNDO LAST BALL</Text>
              </TouchableOpacity>
            )}
          </View>

          {!setupDone ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>OPENING BATTERS & BOWLER</Text>
              <Text style={styles.muted}>
                Choose the two opening batters, who faces first, and the opening bowler.
              </Text>

              <Text style={styles.selectorLabel}>Striker (on strike)</Text>
              <Picker
                selectedValue={selectedStriker}
                onValueChange={setSelectedStriker}
                style={styles.lightPicker}
              >
                <Picker.Item label="Select striker..." value="" />
                {battingPlayers.map(player => (
                  <Picker.Item
                    key={player.player_id}
                    label={player.player_name}
                    value={String(player.player_id)}
                  />
                ))}
              </Picker>

              <Text style={styles.selectorLabel}>Non-striker</Text>
              <Picker
                selectedValue={selectedNonStriker}
                onValueChange={setSelectedNonStriker}
                style={styles.lightPicker}
              >
                <Picker.Item label="Select non-striker..." value="" />
                {battingPlayers.map(player => (
                  <Picker.Item
                    key={player.player_id}
                    label={player.player_name}
                    value={String(player.player_id)}
                  />
                ))}
              </Picker>

              <TouchableOpacity style={styles.secondaryButton} onPress={swapOpeners}>
                <Text style={styles.secondaryButtonText}>SWAP STRIKE</Text>
              </TouchableOpacity>

              <Text style={styles.selectorLabel}>Opening bowler</Text>
              <Picker
                selectedValue={selectedBowler}
                onValueChange={setSelectedBowler}
                style={styles.lightPicker}
              >
                <Picker.Item label="Select bowler..." value="" />
                {bowlingPlayers.map(player => (
                  <Picker.Item
                    key={player.player_id}
                    label={player.player_name}
                    value={String(player.player_id)}
                  />
                ))}
              </Picker>

              <TouchableOpacity style={styles.primaryButton} onPress={startScoring}>
                <Text style={styles.primaryButtonText}>START SCORING</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>
          {(waitingForBatsman || waitingForBowler) && (
            <View style={styles.selectionPrompt}>
              <Text style={styles.selectionPromptTitle}>
                PLAYER SELECTION REQUIRED
              </Text>

              {waitingForBatsman && (
                <TouchableOpacity
                  style={styles.selectionButton}
                  onPress={() =>
                    openPlayerSelection('batsman', waitingForBatsmanTarget)
                  }
                >
                  <Text style={styles.selectionButtonText}>
                    + SELECT NEW BATSMAN
                  </Text>
                </TouchableOpacity>
              )}

              {waitingForBowler && (
                <TouchableOpacity
                  style={styles.selectionButton}
                  onPress={() => openPlayerSelection('bowler')}
                >
                  <Text style={styles.selectionButtonText}>
                    + SELECT NEXT BOWLER
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>BATTING</Text>
              <Text style={styles.tableHint}>* ON STRIKE</Text>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.playerColumn]}>BATTER</Text>
              <Text style={styles.th}>R</Text>
              <Text style={styles.th}>B</Text>
              <Text style={styles.th}>4s</Text>
              <Text style={styles.th}>6s</Text>
              <Text style={styles.th}>SR</Text>
            </View>

            {activeBatters.map(player => {
              const stat = battingStats.find(
                item => Number(item.player_id) === Number(player.player_id)
              );
              const isStriker =
                String(player.player_id) === selectedStriker;
              const runs = Number(stat?.runs || 0);
              const balls = Number(stat?.balls || 0);

              return (
                <View key={player.player_id} style={styles.tableRow}>
                  <View style={styles.playerColumn}>
                    <Text style={styles.playerName}>
                      {player.player_name}{isStriker ? ' *' : ''}
                    </Text>
                    <Text style={styles.playerRole}>
                      {isStriker ? 'STRIKER' : 'NON-STRIKER'}
                    </Text>
                  </View>
                  <Text style={styles.tdStrong}>{runs}</Text>
                  <Text style={styles.td}>{balls}</Text>
                  <Text style={styles.td}>{stat?.fours || 0}</Text>
                  <Text style={styles.td}>{stat?.sixes || 0}</Text>
                  <Text style={styles.td}>
                    {balls ? ((runs / balls) * 100).toFixed(1) : '0.0'}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>BOWLING</Text>
              <Text style={styles.tableHint}>CURRENT BOWLER</Text>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.playerColumn]}>BOWLER</Text>
              <Text style={styles.th}>O</Text>
              <Text style={styles.th}>R</Text>
              <Text style={styles.th}>W</Text>
              <Text style={styles.th}>ECO</Text>
            </View>

            {bowler ? (() => {
              const stat = bowlingStats.find(
                item => Number(item.player_id) === Number(bowler.player_id)
              );
              const legal = Number(stat?.legal_balls || 0);
              const conceded = Number(stat?.runs_conceded || 0);
              const economy = legal
                ? (conceded / (legal / 6)).toFixed(2)
                : '0.00';

              return (
                <View style={styles.tableRow}>
                  <View style={styles.playerColumn}>
                    <Text style={styles.playerName}>{bowler.player_name}</Text>
                    <Text style={styles.playerRole}>BOWLING</Text>
                  </View>
                  <Text style={styles.td}>{getOvers(legal)}</Text>
                  <Text style={styles.td}>{conceded}</Text>
                  <Text style={styles.tdStrong}>{stat?.wickets || 0}</Text>
                  <Text style={styles.td}>{economy}</Text>
                </View>
              );
            })() : (
              <Text style={styles.muted}>Select a bowler to begin.</Text>
            )}
          </View>

          <View style={styles.scoringCard}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>UPDATE SCORE</Text>
              <Text style={styles.tableHint}>TAP A RUN</Text>
            </View>

            <View style={styles.runGrid}>
              {[0, 1, 2, 3, 4, 6].map(runButton)}
            </View>

            <View style={styles.extrasRow}>
              <TouchableOpacity
                style={styles.extraButton}
                disabled={loading || waitingForBatsman || waitingForBowler}
                onPress={() => recordDelivery({
                  extrasType: 'wide',
                  extrasRuns: 1,
                })}
              >
                <Text style={styles.extraText}>WD +1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.extraButton}
                disabled={loading || waitingForBatsman || waitingForBowler}
                onPress={() => recordDelivery({
                  extrasType: 'no_ball',
                  extrasRuns: 1,
                })}
              >
                <Text style={styles.extraText}>NB +1</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.selectorLabel}>Byes</Text>
            <View style={styles.extrasRow}>
              {[1, 2, 3, 4].map(n => (
                <TouchableOpacity
                  key={`bye-${n}`}
                  style={styles.extraButton}
                  disabled={loading || waitingForBatsman || waitingForBowler}
                  onPress={() => recordDelivery({ extrasType: 'bye', extrasRuns: n })}
                >
                  <Text style={styles.extraText}>B {n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.selectorLabel}>Leg byes</Text>
            <View style={styles.extrasRow}>
              {[1, 2, 3, 4].map(n => (
                <TouchableOpacity
                  key={`lb-${n}`}
                  style={styles.extraButton}
                  disabled={loading || waitingForBatsman || waitingForBowler}
                  onPress={() => recordDelivery({ extrasType: 'leg_bye', extrasRuns: n })}
                >
                  <Text style={styles.extraText}>LB {n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.selectorLabel}>Wicket type</Text>
            <Picker
              selectedValue={selectedWicketType}
              onValueChange={value => {
                setSelectedWicketType(value);
                setSelectedFielder(
                  value !== 'run_out' && bowlingPlayers[0]
                    ? String(bowlingPlayers[0].player_id)
                    : ''
                );
              }}
              style={styles.lightPicker}
            >
              {wicketTypes.map(type => (
                <Picker.Item
                  key={type}
                  label={formatWicket(type)}
                  value={type}
                />
              ))}
            </Picker>

            {selectedWicketType === 'run_out' && (
              <>
                <Text style={styles.selectorLabel}>Who was run out?</Text>
                <View style={styles.chipRow}>
                  {[
                    { id: 'striker', label: `${striker?.player_name || 'Striker'} (striker)` },
                    { id: 'nonStriker', label: `${nonStriker?.player_name || 'Non-striker'} (non-striker)` },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.chip, runOutWho === option.id && styles.chipActive]}
                      onPress={() => setRunOutWho(option.id)}
                    >
                      <Text
                        style={[styles.chipText, runOutWho === option.id && styles.chipTextActive]}
                        numberOfLines={2}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.selectorLabel}>Runs completed before the run-out</Text>
                <View style={styles.chipRow}>
                  {[0, 1, 2, 3].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.chip, runOutRuns === n && styles.chipActive]}
                      onPress={() => setRunOutRuns(n)}
                    >
                      <Text style={[styles.chipText, runOutRuns === n && styles.chipTextActive]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.selectorLabel}>Delivery type</Text>
                <View style={styles.chipRow}>
                  {[
                    { id: 'none', label: 'Normal' },
                    { id: 'no_ball', label: 'No ball' },
                    { id: 'wide', label: 'Wide' },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.chip, runOutExtra === option.id && styles.chipActive]}
                      onPress={() => setRunOutExtra(option.id)}
                    >
                      <Text style={[styles.chipText, runOutExtra === option.id && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.muted}>
                  After confirming, choose the incoming batter. The new batter takes the
                  dismissed batter's end; use SWAP STRIKE if you need to change who faces next.
                </Text>
              </>
            )}

            {['caught', 'stumped', 'run_out'].includes(selectedWicketType) && (
              <>
                <Text style={styles.selectorLabel}>
                  {selectedWicketType === 'caught'
                    ? 'Who took the catch?'
                    : selectedWicketType === 'stumped'
                      ? 'Who completed the stumping?'
                      : 'Which fielder made the run out?'}
                </Text>
                <Picker
                  selectedValue={selectedFielder}
                  onValueChange={setSelectedFielder}
                  style={styles.lightPicker}
                >
                  {selectedWicketType === 'run_out' && (
                    <Picker.Item label="Not specified" value="" />
                  )}
                  {bowlingPlayers.map(player => (
                    <Picker.Item
                      key={player.player_id}
                      label={player.player_name}
                      value={String(player.player_id)}
                    />
                  ))}
                </Picker>
              </>
            )}

            <TouchableOpacity
              style={styles.wicketButton}
              disabled={loading || waitingForBatsman || waitingForBowler}
              onPress={confirmWicket}
            >
              <Text style={styles.wicketText}>WICKET</Text>
            </TouchableOpacity>

            {loading && (
              <Text style={styles.loadingText}>Saving delivery...</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>BOWLING FIGURES</Text>

            {activeBowlingStats.map(player => {
              const balls = Number(player.legal_balls || 0);
              const economy = balls
                ? (Number(player.runs_conceded) / (balls / 6)).toFixed(2)
                : '0.00';

              return (
                <View key={player.player_id} style={styles.figureRow}>
                  <Text style={styles.figureName}>{player.player_name}</Text>
                  <Text style={styles.figureValue}>
                    {getOvers(balls)} ov • {player.runs_conceded} runs • {player.wickets} wkts • {economy} eco
                  </Text>
                </View>
              );
            })}

            {!activeBowlingStats.length && (
              <Text style={styles.muted}>No bowling figures yet.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>RECENT BALLS</Text>
            <Text style={styles.muted}>Latest deliveries first</Text>

            <View style={styles.ballStrip}>
              {[...deliveryHistory].reverse().map(delivery => (
                <View
                  key={delivery.delivery_id}
                  style={[
                    styles.ballChip,
                    delivery.is_wicket ? styles.wicketChip :
                      delivery.extras_type !== 'none' ? styles.extraChip : null,
                  ]}
                >
                  <Text style={styles.ballChipText}>
                    {deliveryLabel(delivery)}
                  </Text>
                </View>
              ))}
            </View>

            {deliveryHistory.map(delivery => (
              <View
                key={`history-${delivery.delivery_id}`}
                style={styles.commentaryRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentaryMain}>
                    {delivery.striker_name} • {delivery.bowler_name}
                  </Text>
                  {delivery.is_wicket === 1 && (
                    <Text style={styles.wicketDetail}>
                      {formatWicket(delivery.wicket_type)}
                      {delivery.fielder_name
                        ? ` • Fielder: ${delivery.fielder_name}`
                        : ''}
                      {delivery.dismissed_name
                        ? ` • Out: ${delivery.dismissed_name}`
                        : ''}
                    </Text>
                  )}
                </View>
                <Text style={styles.commentaryResult}>
                  {deliveryLabel(delivery)}
                </Text>
              </View>
            ))}
          </View>

          {inningsEndReason && inningsList.length < 2 && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={createInnings}
            >
              <Text style={styles.primaryButtonText}>START SECOND INNINGS</Text>
            </TouchableOpacity>
          )}

          {inningsEndReason && inningsList.length === 2 && (
            <>
              <Text style={styles.completedText}>MATCH COMPLETED</Text>
              <Text style={styles.completedText}>{getResultText()}</Text>
            </>
          )}
          </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F5F4' },
  content: { paddingBottom: 28 },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F5F4',
  },
  loadingScreenText: {
    color: '#087A62',
    fontSize: 15,
    fontWeight: '700',
  },
  topBar: {
    backgroundColor: '#008F75',
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  brandAccent: { color: '#D7FFF2' },
  topBarRight: {
    color: '#E8FFF7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  matchHeader: {
    backgroundColor: '#008F75',
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  matchTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  matchSubtitle: {
    color: '#D6F5EC',
    fontSize: 11,
    marginTop: 7,
    fontWeight: '600',
  },
  scorePanel: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginBottom: 9,
  },
  inningsLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  bigScore: { color: '#172B24', fontSize: 37, fontWeight: '800' },
  scoreSide: { alignItems: 'flex-end' },
  oversText: { color: '#64748B', fontSize: 10, fontWeight: '700' },
  oversValue: {
    color: '#172B24',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  scoreFooter: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 13,
    paddingTop: 11,
    gap: 22,
  },
  scoreFooterText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  fullScorecardButton: {
    backgroundColor: '#183528',
    padding: 15,
    borderRadius: 9,
    alignItems: 'center',
    marginHorizontal: 15,
    marginTop: 5,
    marginBottom: 12,
  },
  fullScorecardButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginBottom: 9,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    color: '#087A62',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  tableHint: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  tableHeader: {
    backgroundColor: '#E9ECEB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 5,
  },
  th: {
    flex: 1,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '700',
  },
  playerColumn: { flex: 2.2, paddingRight: 4 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: '#EEF0EF',
  },
  playerName: { color: '#1261B5', fontSize: 13, fontWeight: '800' },
  playerRole: {
    color: '#94A3B8',
    fontSize: 9,
    marginTop: 3,
    fontWeight: '700',
  },
  td: {
    flex: 1,
    color: '#26352F',
    fontSize: 12,
    textAlign: 'center',
  },
  tdStrong: {
    flex: 1,
    color: '#172B24',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '900',
  },
  selectionPrompt: {
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  selectionPromptTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  selectionButton: {
    backgroundColor: '#008F75',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 6,
  },
  selectionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  selectorLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  lightPicker: {
    color: '#24352E',
    backgroundColor: '#F4F6F5',
    marginTop: 2,
    height: 48,
  },
  scoringCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    marginBottom: 9,
  },
  runGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  runButton: {
    width: '31.5%',
    backgroundColor: '#008F75',
    borderRadius: 9,
    minHeight: 58,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 9,
  },
  runButtonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  chipRow: { flexDirection: 'row', marginBottom: 10 },
  chip: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginRight: 8,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#087A62' },
  chipText: { color: '#111827', fontWeight: '700', textAlign: 'center' },
  chipTextActive: { color: '#FFFFFF' },
  secondaryButton: {
    backgroundColor: '#E6F4F1',
    borderWidth: 1,
    borderColor: '#087A62',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: '#087A62', fontWeight: '800' },
  toolRow: { flexDirection: 'row', marginHorizontal: 14, marginTop: 10 },
  toolButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5D1',
    padding: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  toolButtonText: { color: '#087A62', fontWeight: '800', fontSize: 12 },
  extrasRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  extraButton: {
    width: '48.5%',
    backgroundColor: '#E7F4EF',
    borderWidth: 1,
    borderColor: '#B9DFD1',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
  },
  extraText: { color: '#087A62', fontSize: 14, fontWeight: '900' },
  wicketButton: {
    backgroundColor: '#D92D35',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  wicketText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  loadingText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 9,
    fontSize: 12,
  },
  figureRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#EEF0EF',
  },
  figureName: { color: '#1261B5', fontWeight: '800', fontSize: 13 },
  figureValue: { color: '#475569', fontSize: 12, marginTop: 4 },
  ballStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    marginBottom: 10,
  },
  ballChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F1ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraChip: { backgroundColor: '#FFF1D6' },
  wicketChip: { backgroundColor: '#FCE2E2' },
  ballChipText: { color: '#24352E', fontWeight: '900', fontSize: 11 },
  commentaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#EEF0EF',
    alignItems: 'center',
  },
  commentaryMain: { color: '#475569', fontSize: 12 },
  commentaryResult: {
    color: '#172B24',
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 8,
  },
  wicketDetail: {
    color: '#B42318',
    fontSize: 11,
    marginTop: 3,
  },
  primaryButton: {
    backgroundColor: '#008F75',
    padding: 15,
    borderRadius: 9,
    alignItems: 'center',
    margin: 15,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    margin: 15,
    borderRadius: 10,
  },
  emptyTitle: {
    color: '#172B24',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 7,
  },
  muted: { color: '#64748B', fontSize: 12, marginTop: 5 },
  completedText: {
    color: '#087A62',
    textAlign: 'center',
    fontWeight: '900',
    padding: 18,
  },
});
