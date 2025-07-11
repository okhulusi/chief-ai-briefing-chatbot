import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({
  path: '.env.local',
});

const checkSchema = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL);
  const db = drizzle(connection);

  console.log('Checking User table schema...');
  
  // Query to get column information for the User table
  const result = await connection.unsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'User'
  `);
  
  console.log('User table columns:');
  console.table(result);
  
  // Close the connection
  await connection.end();
  process.exit(0);
};

checkSchema().catch((err) => {
  console.error('Error checking schema:', err);
  process.exit(1);
});
