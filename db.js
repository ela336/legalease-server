import { MongoClient } from "mongodb";

let client;
let dbPromise;

export function getDb() {
  if (!dbPromise) {
    client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client.connect().then(() => client.db(process.env.DB_NAME));
  }
  return dbPromise;
}