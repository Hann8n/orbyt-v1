import { logger } from '@/utils/logger';

/**
 * Wrap TrueSheet static promises so rejected calls are visible in dev logs.
 */
type NamedSheetOperation = 'present' | 'dismiss' | 'resize' | 'dismissStack';
const IGNORED_TRUE_SHEET_ERRORS = ['Could not find TrueSheet instance'];

function shouldIgnoreTrueSheetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return IGNORED_TRUE_SHEET_ERRORS.some(ignored => message.includes(ignored));
}

export function voidTrueSheet(
  operation: NamedSheetOperation,
  name: string,
  promise: Promise<unknown>
): void;
// eslint-disable-next-line no-redeclare
export function voidTrueSheet(operation: 'dismissAll', promise: Promise<unknown>): void;
// eslint-disable-next-line no-redeclare
export function voidTrueSheet(
  operation: NamedSheetOperation | 'dismissAll',
  nameOrPromise: string | Promise<unknown>,
  maybePromise?: Promise<unknown>
): void {
  const hasName = typeof nameOrPromise === 'string';
  const sheetName = hasName ? nameOrPromise : undefined;
  const promise = hasName ? maybePromise : nameOrPromise;

  if (!promise) {
    return;
  }

  void promise.catch((err: unknown) => {
    if (shouldIgnoreTrueSheetError(err)) {
      return;
    }
    const isError = err instanceof Error;
    logger.debug('TrueSheet promise rejected', {
      component: 'TrueSheet',
      action: operation,
      sheetName,
      error: isError ? err.message : String(err),
      errorName: isError ? err.name : undefined,
      errorStack: isError ? err.stack : undefined,
    });
  });
}
