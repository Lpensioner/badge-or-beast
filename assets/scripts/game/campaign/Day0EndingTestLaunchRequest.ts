let day0EndingTestRequested = false;

export function setDay0EndingTestLaunchRequested(requested: boolean): void {
  day0EndingTestRequested = requested;
}

export function hasDay0EndingTestLaunchRequested(): boolean {
  return day0EndingTestRequested;
}

export function clearDay0EndingTestLaunchRequested(): void {
  day0EndingTestRequested = false;
}

export function consumeDay0EndingTestLaunchRequested(): boolean {
  const requested = day0EndingTestRequested;
  day0EndingTestRequested = false;
  return requested;
}
