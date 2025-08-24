// src/services/socket.ts
import { io, type Socket } from "socket.io-client";

type SocketIOClient = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ServerToClientEvents {
  response: (data: string) => void;
}

interface ClientToServerEvents {
  message: (data: string) => void;
}

class SocketService {
  private socket: SocketIOClient | null = null;
  private initialized: boolean = false;

  public init(url: string = "http://localhost:25823"): void {
    if (this.initialized) return;

    this.socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("SocketIO connected");
    });

    this.socket.on("disconnect", () => {
      console.log("SocketIO disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("SocketIO connect error:", error);
    });

    this.initialized = true;
  }

  public getSocket(): SocketIOClient | null {
    return this.socket;
  }

  public sendMessage(message: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("message", message);
    } else {
      console.error("SocketIO not connected");
    }
  }

  public on(event: any, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.initialized = false;
    }
  }
}

export default new SocketService();
