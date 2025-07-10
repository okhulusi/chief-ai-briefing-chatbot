import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Assumes POSTGRES_URL is set in your environment (Neon connection string)
const client = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
export const db = drizzle(client);
