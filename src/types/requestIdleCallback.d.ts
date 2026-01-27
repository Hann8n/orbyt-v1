/**
 * Type declarations for requestIdleCallback API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
 */

declare function requestIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  options?: { timeout?: number }
): number;

declare function cancelIdleCallback(handle: number): void;

interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}
