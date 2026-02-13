import { NextRequest, NextResponse } from 'next/server';
import { getLobbies } from '@/app/features/lobby/services/lobby-service';
import { querySchema } from '@/lib/solana/schemas';
import type { LobbiesResponse } from '@/types/domain';

export async function GET(request: NextRequest): Promise<NextResponse<LobbiesResponse>> {
  const parsedQuery = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? '25'
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        lobbies: [],
        source: 'rpc_only',
        errors: [{ code: 'VALIDATION_ERROR', message: 'Invalid query parameters.', detail: parsedQuery.error.message }]
      },
      { status: 400 }
    );
  }

  try {
    const result = await getLobbies(parsedQuery.data.limit);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown route failure';
    return NextResponse.json(
      {
        lobbies: [],
        source: 'rpc_only',
        errors: [{ code: 'INTERNAL_ERROR', message: 'Failed to get lobbies.', detail: message }]
      },
      { status: 500 }
    );
  }
}
