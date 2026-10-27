declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

declare module 'node:http' {
  interface IncomingMessage {
    requestId: string;
  }
}

export {};
