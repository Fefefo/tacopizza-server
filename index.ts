import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket, { SocketStream } from "@fastify/websocket";
import { createCustomId } from "mnemonic-id";

import { EEvent } from "./src/data/enums/event.enum";
import { EPhase } from "./src/data/enums/phase.enum";
import { CardPlayedMessage } from "./src/data/models/card_played_message.model";
import { Message } from "./src/data/models/message.model";
import { QueryString } from "./src/data/interfaces/query_string.interface";
import { Lobby } from "./src/data/models/lobby.model";

const PORT = 6464;
const lobbies: { [lobbyID: string]: Lobby } = {};

async function startServer() {
  const server = fastify();
  await server.register(fastifyWebsocket);
  await server.register(cors, {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  });

  server.post("/createLobby", (_, __) => {
    const lobbyID = createCustomId({
      delimiter: "-",
      capitalize: true,
      adjectives: 2,
      subject: true,
      numberSuffix: 4,
    });
    const newLobby: Lobby = new Lobby(lobbyID);
    lobbies[lobbyID] = newLobby;
    const millsDelay = 10000;

    setTimeout(() => {
      if (
        (lobbies[lobbyID] && !lobbies[lobbyID].players) ||
        (lobbies[lobbyID] && lobbies[lobbyID].players?.length === 0)
      ) {
        delete lobbies[lobbyID];
      }
    }, millsDelay);
    return lobbyID;
  });

  server.get("/isJoinable", (request, reply) => {
    let { lobbyID, playerName } = request.query as QueryString;
    if (!lobbies[lobbyID]) {
      reply.code(404).send({ error: "lobby not found" });
      return;
    }
    const lobby = lobbies[lobbyID];

    if (lobby.state != EPhase.joiningPhase) {
      reply.code(403).send({ error: "lobby already started" });
      return;
    }

    if (lobby.players.length >= 8) {
      reply.code(403).send({ error: "lobby is full" });
      return;
    }

    for (const player of lobby.players) {
      if (player.name === playerName) {
        reply.code(403).send({ error: "username already taken" });
        return;
      }
    }
    return "1";
  });

  server.get("/joinLobby", { websocket: true }, (connection, req) => {
    let { lobbyID, playerName } = req.query as QueryString;
    if (!lobbies[lobbyID]) {
      connection.socket.send("lobby not found");
      connection.socket.close(1007, "lobby not found");
      return;
    }
    const lobby = lobbies[lobbyID];

    if (lobby.state != EPhase.joiningPhase) {
      connection.socket.send("lobby already started");
      connection.socket.close(1007, "lobby already started");
      return;
    }

    if (lobby.players.length >= 8) {
      connection.socket.send("lobby full");
      connection.socket.close(1007, "lobby full");
      return;
    }

    for (const player of lobby.players) {
      if (player.name === playerName) {
        connection.socket.send("username already taken");
        connection.socket.close(1007, "username already taken");
        return;
      }
    }

    lobby.addPlayer(connection, playerName);

    connection.socket.on("message", (message: string) => {
      handleClientMessage(lobby, message, connection);
    });

    connection.socket.on("close", () => {
      connection.socket.close();
      lobby.removePlayer(connection);
      if (lobby.players.length == 0) {
        delete lobbies[lobbyID];
      } else if (
        lobby.players.length == 1 &&
        lobby.state != EPhase.joiningPhase
      ) {
        lobby.players[0].conn.socket.close();
        delete lobbies[lobbyID];
      }
    });
  });

  server.listen({ port: PORT }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
  });
}

function handleClientMessage(
  lobby: Lobby,
  message: string,
  conn: SocketStream
) {
  const msg: Message = JSON.parse(message);
  switch (msg.messageType) {
    case EEvent.gameStartEvent:
      lobby.start();
      break;
    case EEvent.playCardEvent:
      playCard(lobby, conn);
      break;
    case EEvent.handSmashEvent:
      playSmash(lobby, message, conn);
      break;
    default:
      break;
  }
}

function playCard(lobby: Lobby, conn: SocketStream) {
  if (
    lobby.players[lobby.currentPlayer].conn != conn ||
    lobby.state != EPhase.cardPhase
  ) {
    return;
  }
  const played = new CardPlayedMessage(
    lobby.players[lobby.currentPlayer].name,
    lobby.players[lobby.currentPlayer].cards[0],
    lobby.currentMascy
  );
  if (lobby.players[lobby.currentPlayer].cards.length <= 4)
    played.num = `${lobby.players[lobby.currentPlayer].cards.length - 1}`;
  const msg = new Message(EEvent.cardPlayedEvent, played);
  for (const p of lobby.players) {
    p.conn.socket.send(msg.text());
  }
  lobby.tableCards.push(lobby.players[lobby.currentPlayer].cards[0]);
  lobby.players[lobby.currentPlayer].cards.shift();

  lobby.state = EPhase.smashPhase;

  setTimeout(() => checkSmashed(lobby), 2000);
}

function playSmash(lobby: Lobby, message: string, conn: SocketStream) {
  if (lobby.state != EPhase.smashPhase) {
    return;
  }

  const msg: Message = JSON.parse(message);
  const timeSmash = parseFloat(msg.info);

  for (const p of lobby.players) {
    if (p.conn == conn) {
      if (p.smashTime != 0) {
        return;
      }
      p.smashTime = timeSmash;
    }
  }
}

function checkSmashed(lobby: Lobby) {
  let taken = false;
  let realSmash = false;

  if (lobby.tableCards[lobby.tableCards.length - 1] == lobby.currentMascy) {
    realSmash = true;
    let n = 0,
      maxTime = 0,
      index = 0,
      takeCards: number[] = [];

    for (const p of lobby.players) {
      if (p.smashTime == 0) {
        takeCards.push(index);
      } else if (p.smashTime > maxTime) {
        n = index;
        maxTime = p.smashTime;
      }
      index++;
    }

    if (takeCards.length > 0) {
      let takers: string[] = [];
      for (const v of takeCards) {
        lobby.players[v].cards.push(...lobby.tableCards);
        takers.push(lobby.players[v].name);
      }
      const msg = new Message(EEvent.getCardsEvent, takers);
      for (const p of lobby.players) {
        p.conn.socket.send(msg.text());
      }
    } else {
      lobby.players[n].cards.push(...lobby.tableCards);

      const msg = new Message(EEvent.getCardsEvent, [lobby.players[n].name]);
      for (const p of lobby.players) {
        p.conn.socket.send(msg.text());
      }
    }
    taken = true;
  } else {
    let takers: string[] = [];
    for (const p of lobby.players) {
      if (p.smashTime != 0) {
        takers.push(p.name);
        p.cards.push(...lobby.tableCards);
        taken = true;
      }
    }
    if (takers.length > 0) {
      const msg = new Message(EEvent.getCardsEvent, takers);
      for (const p of lobby.players) {
        p.conn.socket.send(msg.text());
      }
    }
  }
  if (taken) {
    lobby.tableCards = [];
  }

  for (const p of lobby.players) {
    p.smashTime = 0;
  }

  if (realSmash && checkWinner(lobby)) {
    return;
  }

  lobby.nextTurn();
  return;
}

function checkWinner(lobby: Lobby): boolean {
  for (const p of lobby.players) {
    if (p.cards.length == 0) {
      const msg = new Message(EEvent.playerWinEvent, p.name);
      for (const pToSend of lobby.players) {
        pToSend.conn.socket.send(msg.text());
      }
      return true;
    }
  }
  return false;
}

startServer();
