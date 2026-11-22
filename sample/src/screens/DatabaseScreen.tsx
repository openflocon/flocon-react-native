import { Flocon } from '@openflocon/react-native';
import '@openflocon/database';
import * as SQLite from 'expo-sqlite';

import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

const DOGS: [string, string][] = [
  ['Rex', 'Labrador'],
  ['Milo', 'Beagle'],
  ['Luna', 'Poodle'],
  ['Rocky', 'Boxer'],
  ['Bella', 'Husky'],
];

let db: SQLite.SQLiteDatabase | null = null;

/** `dogs.sqlite` is created on the first run (by expo-sqlite) and registered with Flocon under the name "Dogs". */
async function open(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const opened = await SQLite.openDatabaseAsync('dogs.sqlite');
  await opened.execAsync('CREATE TABLE IF NOT EXISTS dogs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, breed TEXT NOT NULL)');
  Flocon.database.register('Dogs', opened.databasePath);
  db = opened;
  return opened;
}

export function DatabaseScreen() {
  return (
    <SampleScreenContainer screen="Database">
      <SampleSection title="Rows">
        <SampleActionRow
          title="Dog"
          detail="Insert a dog in dogs.sqlite"
          buttonTitle="Insert"
          action={async () => {
            const d = await open();
            const [name, breed] = DOGS[Math.floor(Math.random() * DOGS.length)];
            const sql = 'INSERT INTO dogs (name, breed) VALUES (?, ?)';
            Flocon.database.logQuery(d.databasePath, sql, [name, breed]);
            const r = await d.runAsync(sql, name, breed);
            return `${name} (${breed}) → id ${r.lastInsertRowId}`;
          }}
        />
        <SampleActionRow
          title="Count"
          detail="SELECT COUNT(*) FROM dogs"
          buttonTitle="Query"
          action={async () => {
            const d = await open();
            const sql = 'SELECT COUNT(*) AS count FROM dogs';
            Flocon.database.logQuery(d.databasePath, sql);
            const row = await d.getFirstAsync<{ count: number }>(sql);
            return `${row?.count ?? 0} dog(s)`;
          }}
        />
        <SampleActionRow
          title="Clear"
          detail="DELETE FROM dogs"
          buttonTitle="Delete"
          isDestructive
          action={async () => {
            const d = await open();
            const sql = 'DELETE FROM dogs';
            Flocon.database.logQuery(d.databasePath, sql);
            return `${(await d.runAsync(sql)).changes} row(s) deleted`;
          }}
        />
      </SampleSection>
      <SampleInfoCard
        text={
          'dogs.sqlite is created on the first run, in the SQLite folder of expo-sqlite, and registered with Flocon. The queries above are ' +
          'also logged: see them in Flocon > Database, next to the ones you run from the desktop.'
        }
      />
    </SampleScreenContainer>
  );
}
