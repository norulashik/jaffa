// Shared pagination helper for leaderboard-style endpoints.
// Reads `page` (1-indexed) and `pageSize` from query string, clamps them, and
// returns Sequelize-ready `limit` + `offset` plus echo fields for the response.
//
// Response pattern:
//   { data: [...], page, pageSize, totalCount, totalPages }

import type { Request } from "express";

export interface PaginationOptions {
  defaultPageSize?: number; // how many rows per page if client doesn't specify
  maxPageSize?: number;     // hard cap on pageSize to prevent abuse
}

export interface PaginationResult {
  page: number;        // 1-indexed
  pageSize: number;    // clamped
  limit: number;       // Sequelize: same as pageSize
  offset: number;      // Sequelize: (page - 1) * pageSize
}

export function parsePagination(
  req: Request,
  { defaultPageSize = 25, maxPageSize = 100 }: PaginationOptions = {}
): PaginationResult {
  const rawPage = Number.parseInt(String(req.query.page ?? "1"), 10);
  const rawPageSize = Number.parseInt(String(req.query.pageSize ?? defaultPageSize), 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(rawPageSize, 1), maxPageSize)
    : defaultPageSize;
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function paginationMeta(p: PaginationResult, totalCount: number) {
  return {
    page: p.page,
    pageSize: p.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / p.pageSize)),
  };
}
