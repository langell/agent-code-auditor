export async function POST(req: Request) {
  const body = await req.json();
  
  // Directly using the body without validation!
  const user = await db.insert('users').values(body);
  
  return Response.json(user);
}

const db = {
  insert: (t: string) => ({ values: (v: string) => v })
};
