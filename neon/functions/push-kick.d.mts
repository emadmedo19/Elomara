export function dispatchQueuedPushes(
  request: Request,
  authorize: (authorization: string) => Promise<number>,
  deliver: (request: Request) => Promise<Response>
): Promise<Response>;
