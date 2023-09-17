import { SocketStream } from "@fastify/websocket";
import { EPhase } from "../enums/phase.enum";
import { EEvent } from "../enums/event.enum";
import { Message } from "./message.model";

/**
 * A lobby is a match object that contains the lobby logic.
 */
export class Lobby {
  id: string;
  players: Player[] = [];
  tableCards: number[] = [];
  state: number = 0;
  currentPlayer: number = 0;
  currentMascy: number = -1;

  constructor(ID: string) {
    this.id = ID;
  }

  /**
   * Adds a player to the lobby.
   * @param conn is a socket stream.
   * @param name is the name of the player to add.
   */
  addPlayer(conn: SocketStream, name: string): void {
    for (const p of this.players) {
      if (conn == p.conn) {
        return;
      }
    }
    this.players.push(new Player(name, conn));

    for (const p of this.players) {
      if (p.conn == conn) {
        let players: string[] = [];
        for (const p2 of this.players) {
          players.push(p2.name);
        }
        const msg = new Message(EEvent.playerList, players);
        p.conn.socket.send(msg.text());
        continue;
      }
      const msg = new Message(EEvent.playerJoinedEvent, name);
      p.conn.socket.send(msg.text());
    }
  }

  /**
   * Removes a player to the lobby.
   * @param conn is a socket stream.
   */
  removePlayer(conn: SocketStream): void {
    let name = "",
      n = 0;
    for (const p of this.players) {
      if (conn == p.conn) {
        name = p.name;
        break;
      }
      n++;
    }
    this.players.splice(n, 1);
    for (const p of this.players) {
      const msg = new Message(EEvent.playerLeavedEvent, name);
      p.conn.socket.send(msg.text());
    }
  }

  /**
   * Deals cards to players.
   */
  dealCards(): void {
    const cards: number[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 13; j++) {
        cards.push(i);
      }
    }

    // mischiare
    for (let i = cards.length - 1; i > 0; i--) {
      const random = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[random]] = [cards[random], cards[i]];
    }

    let nCard = 0;
    switch (this.players.length) {
      case 2:
      case 3:
      case 4:
      case 5:
        nCard = 12;
        break;

      case 6:
        nCard = 10;
        break;

      case 7:
        nCard = 9;
        break;

      case 8:
        nCard = 8;
        break;

      default:
        break;
    }

    for (const p of this.players) {
      p.cards = cards.splice(0, nCard);
    }
  }

  /**
   * Starts the lobby.
   */
  start(): void {
    if (this.players.length < 2) {
      return;
    }
    if (this.state != EPhase.joiningPhase) {
      return;
    }

    this.dealCards();

    const msg = new Message(EEvent.gameStartedEvent, "");
    for (const p of this.players) {
      p.conn.socket.send(msg.text());
    }

    this.currentPlayer = Math.floor(Math.random() * this.players.length);
    this.state = EPhase.playingPhase;
    this.nextTurn();
  }

  /**
   * Manages the turn logic.
   *
   * Gives the action capability to the next player.
   */
  nextTurn(): void {
    let next = true;
    let lap = 0;
    while (next) {
      this.currentPlayer++;
      if (this.currentPlayer == this.players.length) {
        this.currentPlayer = 0;
      }
      if (this.players[this.currentPlayer].cards.length != 0) {
        next = false;
      } else {
        lap++;
      }
      if (lap > this.players.length) {
        this.dealCards();
        const msg = new Message(EEvent.reshuffleCardsEvent, "");
        for (const p of this.players) {
          p.conn.socket.send(msg.text());
        }
      }
    }
    this.currentMascy++;
    if (this.currentMascy == 5) {
      this.currentMascy = 0;
    }
    const msg = new Message(
      EEvent.playerTurnEvent,
      this.players[this.currentPlayer].name
    );
    for (const p of this.players) {
      p.conn.socket.send(msg.text());
    }
    this.state = EPhase.cardPhase;
  }
}

/**
 * A player is an object that contains the name, the socket stream, the cards and the time of the last smash of a player.
 */
class Player {
  name: string;
  conn: SocketStream;
  cards: number[] = [];
  smashTime: number = 0;

  constructor(Name: string, Conn: SocketStream) {
    this.name = Name;
    this.conn = Conn;
  }
}
