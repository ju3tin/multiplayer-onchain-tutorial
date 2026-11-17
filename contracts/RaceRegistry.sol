pragma solidity ^0.8.20;

contract RaceRegistry {
    struct Race {
        address winner;
        address[] players;
        uint256 timestamp;
        uint256 prizePool;
        bool exists;
    }

    Race[] public races;

    mapping(address => uint256) public wins;
    mapping(address => uint256) public racesPlayed;

    event RaceCreated(
        uint256 indexed raceId,
        address indexed winner,
        address[] players,
        uint256 prizePool
    );

    function submitRace(
        address[] calldata players,
        address winner
    ) external payable returns (uint256 raceId) {
        require(players.length >= 2, "Need at least 2 players");
        require(winner != address(0), "Invalid winner");

        bool winnerInRace = false;
        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player");
            if (players[i] == winner) {
                winnerInRace = true;
            }
            racesPlayed[players[i]] += 1;
        }
        require(winnerInRace, "Winner must be one of the players");

        raceId = races.length;

        races.push(Race({
            winner: winner,
            players: players,
            timestamp: block.timestamp,
            prizePool: msg.value,
            exists: true
        }));

        wins[winner] += 1;

        if (msg.value > 0) {
            (bool success, ) = winner.call{value: msg.value}("");
            require(success, "Prize transfer failed");
        }

        emit RaceCreated(raceId, winner, players, msg.value);
    }

    function getRace(uint256 raceId) external view returns (Race memory) {
        require(races[raceId].exists, "Race does not exist");
        return races[raceId];
    }

    function getWins(address player) external view returns (uint256) {
        return wins[player];
    }

    function getRacesPlayed(address player) external view returns (uint256) {
        return racesPlayed[player];
    }

    function totalRaces() external view returns (uint256) {
        return races.length;
    }
}
