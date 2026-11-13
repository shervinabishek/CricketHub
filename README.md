# CricketHub 🏏

CricketHub is an offline cricket management and live scoring mobile app built with React Native and Expo. It lets you manage teams and players, schedule matches, score them ball by ball, and review full scorecards and player statistics. All data is stored on the device in a local SQLite database, so no internet connection or account is needed.

## Features

### Team and player management
- Add, edit, search and delete teams (coach and home ground included)
- Add, edit, search and delete players (role, jersey number, batting and bowling style)
- Deleting a team also removes its players and matches; deleting a player recalculates the affected match scores

### Matches
- Create matches with teams, date, venue and format (T10, T20, ODI, Test) and an editable overs limit
- Filter matches by status: Scheduled, Live and Completed

### Live scoring
- Toss selection (winner and bat/bowl decision) decides who bats first
- Playing XI and bench per match: the first 11 players of each team are selected automatically and can be changed. Bench players cannot bat, bowl or field until they are made active
- Choose the opening batters, the striker and the opening bowler before scoring starts
- Record runs (0, 1, 2, 3, 4, 6), wides, no-balls, byes and leg-byes
- Wickets: bowled, caught, LBW, stumped, hit wicket, run out and others, with fielder selection
- Run-outs: choose which batter is out, runs completed before the run-out and the delivery type
- Automatic strike rotation (odd runs and end of over), new batter and next bowler selection
- Swap strike and undo last ball
- Overs limit, all-out and target-chased detection, second innings target, and match result (winner or tie)
- Resume an innings in progress after leaving the screen

### Scorecards
- Full match scorecard with batting (runs, balls, 4s, 6s, strike rate) and bowling (overs, runs, wickets, economy)
- Dismissal descriptions such as `c Smith b Jones` and `run out (Fielder)`
- Extras breakdown, innings total and fall of wickets
- Match history for completed matches

### Player profiles
- Batting: innings, not outs, runs, highest score, average, strike rate, 4s, 6s, 50s, 100s, ducks
- Bowling: overs, runs, wickets, best figures, average, economy, strike rate, 3-wicket and 5-wicket hauls
- Fielding: catches, stumpings, run-outs
- Match-by-match performance list

### Dashboard and settings
- Live dashboard with team, player and match counts, live match scores, top run scorer and top wicket taker
- Settings screen to load sample data or reset all data

## Technologies Used

| Area | Technology |
|---|---|
| Framework | React Native with Expo |
| Language | JavaScript |
| Navigation | React Navigation (bottom tabs and native stack) |
| Database | SQLite via `expo-sqlite` |
| UI components | `@react-native-picker/picker`, `@react-native-community/datetimepicker`, `@expo/vector-icons` |

## Project Structure

```
CricketHub/
├── App.js                      # App entry: database setup and navigation
├── index.js
├── app.json                    # Expo configuration
├── package.json
└── src/
    ├── database/
    │   └── db.js               # SQLite schema, migrations and helper functions
    ├── navigation/
    │   └── AppNavigator.js     # Tabs and stack navigation
    └── screens/
        ├── DashboardScreen.js
        ├── TeamsScreen.js
        ├── PlayersScreen.js
        ├── PlayerProfileScreen.js
        ├── MatchesScreen.js
        ├── ScorecardScreen.js  # Match list and history
        ├── InningsScreen.js    # Live scoring
        ├── SquadScreen.js      # Playing XI and bench
        ├── PlayerSelectionScreen.js
        ├── FullScorecardScreen.js
        └── SettingsScreen.js
```

## Database

The app creates these SQLite tables automatically on first launch: `teams`, `players`, `matches`, `match_squads`, `innings` and `ball_events`. Every delivery is stored in `ball_events`, and scorecards and player statistics are calculated from it.

## Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS version) and npm
- [Git](https://git-scm.com/)
- The **Expo Go** app on your Android or iOS phone, or an Android emulator / iOS simulator

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR-USERNAME/CricketHub.git
cd CricketHub

# 2. Install dependencies
npm install

# 3. Start the development server
npx expo start -c
```

### Running the app
- **On a phone:** scan the QR code shown in the terminal with Expo Go (Android) or the Camera app (iOS). The phone and computer must be on the same Wi-Fi network.
- **Android emulator:** press `a` in the terminal.
- **iOS simulator (macOS only):** press `i` in the terminal.

### Troubleshooting
- **PowerShell blocks `npm` ("running scripts is disabled"):** use Command Prompt, or run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once in PowerShell.
- **Package version warnings:** run `npx expo install --fix`.
- **Stale errors after updating the code or database:** run `npx expo start -c` and uninstall the old app from the device or emulator so the old database is removed.

## How to Use

1. Open **Settings** and tap **Load sample data**, or add your own teams and players in the **Teams** and **Players** tabs.
2. Create a match in the **Matches** tab.
3. Open the **Scorecards** tab and tap the match.
4. Choose the toss result, check the **Playing XI / Bench**, then start the first innings.
5. Select the opening batters, the striker and the opening bowler, then start scoring.
6. When both innings finish, the result is saved. View it any time under **Match History** in the Scorecards tab.
7. Open a player's **Profile** from the Players tab to see their career statistics.

## Author

Shervin Abishek — [GitHub profile](https://github.com/shervinabishek)

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file included in the repository.
