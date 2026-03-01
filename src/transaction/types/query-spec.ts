export interface QuerySpec {
  walletId: string;
  direction?: string;
  categories?: string[];
  assets?: string[];
  minValue?: string;
  maxValue?: string;
  counterparty?: string;
  startTime?: string;
  endTime?: string;
  sort?: string;
  limit: number;
  cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function normalizeQuerySpec(spec: Partial<QuerySpec> & { walletId: string }): QuerySpec {
  let limit = spec.limit ?? DEFAULT_LIMIT;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return {
    ...spec,
    limit,
    sort: spec.sort ?? 'createdAt_desc',
  };
}
