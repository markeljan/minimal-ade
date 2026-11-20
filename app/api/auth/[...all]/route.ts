import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/auth';

const authHandler = (request: Request) => getAuth().handler(request);

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(authHandler);
