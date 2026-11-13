import { createServer, type RequestListener } from 'node:http';

export interface UpstreamServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startUpstream(handler: RequestListener): Promise<UpstreamServer> {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    server.close();
    throw new Error('Failed to obtain upstream server port');
  }

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }
    closePromise = new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
      server.closeAllConnections();
    });
    return closePromise;
  };

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close,
  };
}
