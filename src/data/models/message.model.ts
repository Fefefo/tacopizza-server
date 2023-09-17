export class Message {
  messageType: number;
  info: any;

  constructor(MessageType: number, Info: any) {
    this.messageType = MessageType;
    this.info = Info;
  }

  text() {
    return JSON.stringify(this);
  }
}
