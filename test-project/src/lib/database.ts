// Database helper without atomic transaction
export async function createMatch(data: unknown) {
  // Simulating multiple database inserts
  await db.insert(matches).values(data.matchData);
  await db.insert(scorecards).values(data.scorecardData);
  return true;
}

const db = {
  insert: (table: string) => ({
    values: (data: string) => Promise.resolve(true)
  })
};
const matches = 'matches';
const scorecards = 'scorecards';
