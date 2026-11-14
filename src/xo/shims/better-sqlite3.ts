/** Browser stand-in. XO's SQLite adapter is unfinished; the app uses IndexedDB. */
export default class Database {
  constructor() {
    throw new Error("better-sqlite3 is not used in the browser.");
  }
}
