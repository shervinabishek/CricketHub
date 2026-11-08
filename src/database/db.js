
import * as SQLite from 'expo-sqlite';

let dbPromise = null;

export const getDatabase = () => {
  if (!dbPromise) {
    dbPromise = openAndPrepareDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
};

const openAndPrepareDatabase = async () => {
  const db = await SQLite.openDatabaseAsync('crickethub.db');

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Create database tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS teams (
      team_id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT NOT NULL UNIQUE,
      coach_name TEXT,
      home_ground TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      player_id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      jersey_number INTEGER,
      role TEXT,
      batting_style TEXT,
      bowling_style TEXT,
      FOREIGN KEY (team_id)
        REFERENCES teams(team_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      match_id INTEGER PRIMARY KEY AUTOINCREMENT,
      team1_id INTEGER NOT NULL,
      team2_id INTEGER NOT NULL,
      match_date TEXT NOT NULL,
      venue TEXT,
      format TEXT NOT NULL,
      overs_limit INTEGER,
      status TEXT DEFAULT 'Scheduled',
      winner_team_id INTEGER,
      FOREIGN KEY (team1_id) REFERENCES teams(team_id),
      FOREIGN KEY (team2_id) REFERENCES teams(team_id),
      FOREIGN KEY (winner_team_id) REFERENCES teams(team_id)
    );

    CREATE TABLE IF NOT EXISTS match_squads (
      match_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      is_playing INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (match_id, player_id),
      FOREIGN KEY (match_id)
        REFERENCES matches(match_id)
        ON DELETE CASCADE,
      FOREIGN KEY (player_id)
        REFERENCES players(player_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS innings (
      innings_id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      batting_team_id INTEGER NOT NULL,
      innings_number INTEGER NOT NULL,
      total_runs INTEGER NOT NULL DEFAULT 0,
      wickets INTEGER NOT NULL DEFAULT 0,
      balls_bowled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (match_id)
        REFERENCES matches(match_id)
        ON DELETE CASCADE,
      FOREIGN KEY (batting_team_id)
        REFERENCES teams(team_id),
      UNIQUE (match_id, innings_number)
    );

    CREATE TABLE IF NOT EXISTS ball_events (
      delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
      innings_id INTEGER NOT NULL,
      delivery_number INTEGER NOT NULL,
      striker_id INTEGER NOT NULL,
      non_striker_id INTEGER NOT NULL,
      bowler_id INTEGER NOT NULL,
      batter_runs INTEGER NOT NULL DEFAULT 0,
      extras_type TEXT NOT NULL DEFAULT 'none',
      extras_runs INTEGER NOT NULL DEFAULT 0,
      total_runs INTEGER NOT NULL DEFAULT 0,
      is_wicket INTEGER NOT NULL DEFAULT 0,
      wicket_type TEXT,
      dismissed_player_id INTEGER,
      fielder_id INTEGER,
      legal_delivery INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (innings_id)
        REFERENCES innings(innings_id)
        ON DELETE CASCADE,
      FOREIGN KEY (striker_id) REFERENCES players(player_id),
      FOREIGN KEY (non_striker_id) REFERENCES players(player_id),
      FOREIGN KEY (bowler_id) REFERENCES players(player_id),
      FOREIGN KEY (dismissed_player_id) REFERENCES players(player_id),
      FOREIGN KEY (fielder_id) REFERENCES players(player_id),

      UNIQUE (innings_id, delivery_number)
    );
  `);



  // Check whether overs_limit exists
  const matchColumns = await db.getAllAsync(
    'PRAGMA table_info(matches)'
  );

  const hasOversLimit = matchColumns.some(
    column => column.name === 'overs_limit'
  );

  if (!hasOversLimit) {
    await db.execAsync(`
      ALTER TABLE matches
      ADD COLUMN overs_limit INTEGER;
    `);
  }

  if (!matchColumns.some(column => column.name === 'toss_winner_id')) {
    await db.execAsync('ALTER TABLE matches ADD COLUMN toss_winner_id INTEGER;');
  }

  if (!matchColumns.some(column => column.name === 'toss_decision')) {
    await db.execAsync('ALTER TABLE matches ADD COLUMN toss_decision TEXT;');
  }

  // Check whether fielder_id exists
  const ballEventColumns = await db.getAllAsync(
    'PRAGMA table_info(ball_events)'
  );

  const hasFielderId = ballEventColumns.some(
    column => column.name === 'fielder_id'
  );

  if (!hasFielderId) {
    await db.execAsync(`
      ALTER TABLE ball_events
      ADD COLUMN fielder_id INTEGER;
    `);
  }


  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_ball_events_innings
    ON ball_events(innings_id);

    CREATE INDEX IF NOT EXISTS idx_ball_events_striker
    ON ball_events(striker_id);

    CREATE INDEX IF NOT EXISTS idx_ball_events_bowler
    ON ball_events(bowler_id);

    CREATE INDEX IF NOT EXISTS idx_ball_events_fielder
    ON ball_events(fielder_id);
  `);

  return db;
};


// First time a team is used in a match, its first 11 players are
// selected automatically as the playing XI. The rest are on the bench.
export const ensureSquad = async (matchId, teamId) => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync(
    'SELECT COUNT(*) AS c FROM match_squads WHERE match_id = ? AND team_id = ?',
    [matchId, teamId]
  );
  if (existing.c > 0) return;

  const players = await db.getAllAsync(
    'SELECT player_id FROM players WHERE team_id = ? ORDER BY player_id',
    [teamId]
  );
  for (let i = 0; i < players.length; i++) {
    await db.runAsync(
      `INSERT OR IGNORE INTO match_squads (match_id, player_id, team_id, is_playing)
       VALUES (?, ?, ?, ?)`,
      [matchId, players[i].player_id, teamId, i < 11 ? 1 : 0]
    );
  }
};

// Whole squad of a team for a match, with its playing flag.
export const getSquad = async (matchId, teamId) => {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT p.*, COALESCE(s.is_playing, 0) AS is_playing
     FROM players p
     LEFT JOIN match_squads s
       ON s.player_id = p.player_id AND s.match_id = ?
     WHERE p.team_id = ?
     ORDER BY p.player_name`,
    [matchId, teamId]
  );
};

// Only the active (playing) players. Bench players are never returned.
export const getPlayingPlayers = async (matchId, teamId) => {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT p.*
     FROM players p
     JOIN match_squads s
       ON s.player_id = p.player_id
      AND s.match_id = ?
      AND s.is_playing = 1
     WHERE p.team_id = ?
     ORDER BY p.player_name`,
    [matchId, teamId]
  );
};

export const setPlayerPlaying = async (matchId, teamId, playerId, playing) => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO match_squads (match_id, player_id, team_id, is_playing)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(match_id, player_id) DO UPDATE SET is_playing = excluded.is_playing`,
    [matchId, playerId, teamId, playing ? 1 : 0]
  );
};

export const resetSquadToFirst11 = async (matchId, teamId) => {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM match_squads WHERE match_id = ? AND team_id = ?',
    [matchId, teamId]
  );
  await ensureSquad(matchId, teamId);
};


export const recalcInnings = async (inningsId) => {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE innings SET
       total_runs = (SELECT COALESCE(SUM(total_runs), 0) FROM ball_events WHERE innings_id = ?),
       wickets = (SELECT COUNT(*) FROM ball_events WHERE innings_id = ? AND is_wicket = 1),
       balls_bowled = (SELECT COALESCE(SUM(legal_delivery), 0) FROM ball_events WHERE innings_id = ?)
     WHERE innings_id = ?`,
    [inningsId, inningsId, inningsId, inningsId]
  );
};

// Deleting a team removes its matches (with innings and balls) and players.
export const deleteTeamCascade = async (teamId) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM matches WHERE team1_id = ? OR team2_id = ?',
      [teamId, teamId]
    );
    await db.runAsync('DELETE FROM teams WHERE team_id = ?', [teamId]);
  });
};

export const countPlayerEvents = async (playerId) => {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS c FROM ball_events
     WHERE striker_id = ? OR non_striker_id = ? OR bowler_id = ?
        OR dismissed_player_id = ? OR fielder_id = ?`,
    [playerId, playerId, playerId, playerId, playerId]
  );
  return row.c;
};

// Deleting a player also removes the deliveries they were part of and
// recalculates the affected innings totals.
export const deletePlayerCascade = async (playerId) => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const affected = await db.getAllAsync(
      `SELECT DISTINCT innings_id FROM ball_events
       WHERE striker_id = ? OR non_striker_id = ? OR bowler_id = ?
          OR dismissed_player_id = ? OR fielder_id = ?`,
      [playerId, playerId, playerId, playerId, playerId]
    );
    await db.runAsync(
      `DELETE FROM ball_events
       WHERE striker_id = ? OR non_striker_id = ? OR bowler_id = ?
          OR dismissed_player_id = ? OR fielder_id = ?`,
      [playerId, playerId, playerId, playerId, playerId]
    );
    await db.runAsync('DELETE FROM players WHERE player_id = ?', [playerId]);
    for (const row of affected) {
      await recalcInnings(row.innings_id);
    }
  });
};


export const initializeDatabase = () => getDatabase();

// Remove every record (used by Settings > Reset)
export const resetAllData = async () => {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM ball_events;
    DELETE FROM match_squads;
    DELETE FROM innings;
    DELETE FROM matches;
    DELETE FROM players;
    DELETE FROM teams;
    DELETE FROM sqlite_sequence;
  `);
};

// Insert demo teams, players and matches (used by Settings > Load sample data)
export const loadSampleData = async () => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync('SELECT COUNT(*) AS c FROM teams');
  if (existing.c > 0) {
    throw new Error('EXISTING_DATA');
  }

  const teams = [
    ['Vavuniya Warriors', 'S. Kumar', 'Vavuniya Stadium'],
    ['Northern Strikers', 'R. Perera', 'Jaffna Oval'],
  ];
  const roles = [
    'Batsman', 'Batsman', 'Wicketkeeper', 'All-rounder', 'All-rounder',
    'Batsman', 'All-rounder', 'Bowler', 'Bowler', 'Bowler', 'Bowler',
  ];

  await db.withTransactionAsync(async () => {
    for (let t = 0; t < teams.length; t++) {
      const res = await db.runAsync(
        'INSERT INTO teams (team_name, coach_name, home_ground) VALUES (?, ?, ?)',
        teams[t]
      );
      for (let i = 0; i < 11; i++) {
        await db.runAsync(
          `INSERT INTO players
           (team_id, player_name, jersey_number, role, batting_style, bowling_style)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            res.lastInsertRowId,
            `${t === 0 ? 'Warrior' : 'Striker'} Player ${i + 1}`,
            i + 1,
            roles[i],
            'Right-hand',
            roles[i] === 'Bowler' || roles[i] === 'All-rounder' ? 'Right-arm medium' : '',
          ]
        );
      }
    }
    await db.runAsync(
      `INSERT INTO matches (team1_id, team2_id, match_date, venue, format, overs_limit, status)
       VALUES (1, 2, date('now'), 'Vavuniya Stadium', 'T20', 20, 'Scheduled')`
    );
  });
};
