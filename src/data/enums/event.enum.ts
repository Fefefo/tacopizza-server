export enum EEvent {
  playerJoinedEvent, // Server
  playerLeavedEvent, // Server
  gameStartEvent, // Client
  gameStartedEvent, // Server
  playerTurnEvent, // Server
  playCardEvent, // Client
  cardPlayedEvent, // Server
  handSmashEvent, // Client
  getCardsEvent, // Server
  reshuffleCardsEvent, // Server
  playerWinEvent, // Server
  playerList, // Server
}
