// Voting endpoints removed – all requests return 404.
export async function GET() {
  return new Response('Not found', { status: 404 });
}
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
