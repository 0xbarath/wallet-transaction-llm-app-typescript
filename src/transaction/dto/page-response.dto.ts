import { QuerySpec } from '../types/query-spec';

export interface PageResponse<T> {
  items: T[];
  nextCursor: string | null;
  querySpec: QuerySpec;
}
