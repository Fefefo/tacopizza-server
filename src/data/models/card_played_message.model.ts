export class CardPlayedMessage {
  name: string;
  card: number;
  currentMascy: number;
  num: string;

  constructor(name: string, card: number, currentMascy: number) {
    this.name = name;
    this.card = card;
    this.currentMascy = currentMascy;
    this.num = "?";
  }
}
