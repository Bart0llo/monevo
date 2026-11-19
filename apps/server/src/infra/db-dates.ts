import type { LocalDate } from '@monevo/domain';

// PostgreSQL `DATE` columns travel through Prisma as `Date` at UTC midnight. These helpers keep the
// calendar date intact in both directions (coding-conventions.md#3-dates-and-time).

export function toDbDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}
